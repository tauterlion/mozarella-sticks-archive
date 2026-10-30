export const MAX_BYTES = 50 * 1024 * 1024;
export const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
export class IntakeError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export function requireThat(value, code = 'invalid_request') { if (!value) throw new IntakeError(code); }
const string = (s, max, min = 1) => typeof s === 'string' && s.trim().length >= min && s.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s);
const uuid = s => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
export async function sha256(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
export function validateRequest(body) {
  requireThat(body && Object.getPrototypeOf(body) === Object.prototype);
  const common = ['action', 'capability'];
  const fields = {
    batch: ['token', 'consent'], resume: [],
    authorize: ['clientFileId', 'filename', 'mime', 'size', 'caption', 'eventId', 'people', 'noPeople', 'proposedTitle', 'proposedDate', 'proposedDetails', 'consent'],
    complete: ['id'], cancel: ['id']
  };
  requireThat(Object.hasOwn(fields, body.action));
  requireThat(Object.keys(body).every(k => [...common, ...fields[body.action]].includes(k)));
  requireThat(typeof body.capability === 'string' && /^[0-9a-f]{64}$/.test(body.capability));
  if (body.action === 'batch') requireThat(string(body.token, 2048) && body.consent === true);
  if (['complete', 'cancel'].includes(body.action)) requireThat(uuid(body.id));
  if (body.action !== 'authorize') return body;
  requireThat(uuid(body.clientFileId) && body.consent === true);
  requireThat(string(body.filename, 200) && !/[\\/\r\n]/.test(body.filename));
  requireThat(TYPES.includes(body.mime), 'unsupported_type');
  requireThat(Number.isSafeInteger(body.size) && body.size > 0 && body.size <= MAX_BYTES, 'file_too_large');
  requireThat(string(body.caption, 500));
  requireThat(Array.isArray(body.people) && body.people.length <= 100 && body.people.every(p => string(p, 120) && /^[a-z0-9-]+$/.test(p)));
  requireThat(new Set(body.people).size === body.people.length && typeof body.noPeople === 'boolean' && body.noPeople === (body.people.length === 0));
  if (body.eventId !== null) {
    requireThat(string(body.eventId, 120) && /^[a-z0-9-]+$/.test(body.eventId));
    requireThat(body.proposedTitle === null && body.proposedDate === null && body.proposedDetails === null);
  } else {
    requireThat(string(body.proposedTitle, 160) && string(body.proposedDetails, 2000));
    requireThat(body.proposedDate === null || (/^\d{4}-\d{2}-\d{2}$/.test(body.proposedDate) &&
      new Date(body.proposedDate).toISOString().slice(0, 10) === body.proposedDate));
  }
  return body;
}
export function verifyChallenge(result, hostname, now = Date.now()) {
  const age = now - Date.parse(result.challenge_ts);
  requireThat(result.success === true && result.hostname === hostname && result.action === 'aoms_submission' && age >= 0 && age <= 300000, 'captcha_failed');
}
export async function boundedBytes(stream, limit) {
  requireThat(stream, 'empty_file');
  const reader = stream.getReader(), parts = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new IntakeError('file_too_large'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

// Structural admission check, NOT a decoder or malware scanner. All accepted files
// remain private; publication must decode/re-encode and strip metadata separately.
export function inspectMedia(bytes, mime, expectedSize) {
  const n = bytes.length, view = new DataView(bytes.buffer, bytes.byteOffset, n);
  const ok = v => requireThat(v, 'invalid_media');
  const text = (p, len) => String.fromCharCode(...bytes.subarray(p, p + len));
  const u32 = p => view.getUint32(p);
  ok(n > 0 && n <= MAX_BYTES && n === expectedSize && TYPES.includes(mime));
  if (mime === 'image/png') {
    ok(n >= 45 && text(0, 8) === '\x89PNG\r\n\x1a\n');
    let p = 8, header = false, data = false, end = false;
    while (p + 12 <= n) {
      const size = u32(p), type = text(p + 4, 4); ok(size <= n - p - 12 && type !== 'acTL');
      if (!header) { ok(type === 'IHDR' && size === 13); ok(u32(p + 8) > 0 && u32(p + 12) > 0 && u32(p + 8) * u32(p + 12) <= 100000000); header = true; }
      else ok(type !== 'IHDR');
      if (type === 'IDAT') data = true;
      p += size + 12;
      if (type === 'IEND') { ok(size === 0 && p === n); end = true; break; }
    }
    ok(header && data && end);
  } else if (mime === 'image/jpeg') {
    ok(n >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[n - 2] === 255 && bytes[n - 1] === 217);
    let p = 2, frame = false, scan = false;
    while (p < n - 2) {
      ok(bytes[p++] === 255); while (bytes[p] === 255) p++;
      const marker = bytes[p++]; ok(p + 2 <= n);
      const size = view.getUint16(p); ok(size >= 2 && p + size <= n - 2);
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        ok(size >= 8); const h = view.getUint16(p + 3), w = view.getUint16(p + 5);
        ok(w > 0 && h > 0 && w * h <= 100000000); frame = true;
      }
      if (marker === 0xda) { scan = true; break; }
      p += size;
    }
    ok(frame && scan);
  } else if (mime === 'image/webp') {
    ok(n >= 20 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP' && view.getUint32(4, true) + 8 === n);
    let p = 12, data = false;
    while (p + 8 <= n) {
      const type = text(p, 4), size = view.getUint32(p + 4, true); ok(size <= n - p - 8);
      ok(type !== 'ANIM' && type !== 'ANMF');
      if (type === 'VP8X') ok(size === 10 && !(bytes[p + 8] & 2));
      if (type === 'VP8 ') { ok(size >= 10 && text(p + 11, 3) === '\x9d\x01\x2a'); data = true; }
      if (type === 'VP8L') { ok(size >= 5 && bytes[p + 8] === 0x2f); data = true; }
      p += 8 + size + (size % 2);
    }
    ok(data && p === n);
  } else if (mime === 'video/mp4') {
    let p = 0, brand = false, movie = false, data = false;
    const movieTracks = (start, end, depth = 0) => {
      ok(depth < 8); let q = start, video = false;
      while (q + 8 <= end) {
        const size = u32(q), type = text(q + 4, 4); ok(size >= 8 && size <= end - q);
        if (['trak','mdia','minf','stbl'].includes(type)) video = movieTracks(q + 8, q + size, depth + 1) || video;
        if (type === 'stsd') {
          ok(size >= 16); let sample = q + 16;
          const count = u32(q + 12); ok(count > 0 && count <= 64);
          for (let i = 0; i < count; i++) {
            ok(sample + 8 <= q + size); const entry = u32(sample); ok(entry >= 8 && entry <= q + size - sample);
            if (['avc1','avc3','hvc1','hev1','vp09','av01'].includes(text(sample + 4, 4))) { ok(entry >= 86); video = true; }
            sample += entry;
          }
          ok(sample === q + size);
        }
        q += size;
      }
      ok(q === end); return video;
    };
    while (p + 8 <= n) {
      let size = u32(p); const type = text(p + 4, 4);
      let header = 8;
      if (size === 1) { ok(p + 16 <= n && u32(p + 8) === 0); size = u32(p + 12); header = 16; }
      if (size === 0) size = n - p;
      ok(size >= header && size <= n - p);
      if (p === 0) ok(type === 'ftyp');
      if (type === 'ftyp') { ok(size >= 16 && /^(isom|iso[2-9]|mp4[12]|avc1|M4V )$/.test(text(p + header, 4))); brand = true; }
      if (type === 'moov') { ok(size > header); movie = movieTracks(p + header, p + size); }
      if (type === 'mdat') { ok(size > header); data = true; }
      p += size;
    }
    ok(p === n && brand && movie && data);
  } else {
    ok(n >= 24 && u32(0) === 0x1a45dfa3);
    // Parse EBML header (bounded), require exact WebM DocType and Segment marker.
    const vint = (p, keep = false) => {
      let len = 1, mask = 128; while (len <= 8 && !(bytes[p] & mask)) { mask >>= 1; len++; }
      ok(len <= 8 && p + len <= n); let value = keep ? bytes[p] : bytes[p] & (mask - 1);
      for (let i = 1; i < len; i++) value = value * 256 + bytes[p + i];
      return { len, value };
    };
    const header = vint(4); const end = 4 + header.len + header.value; ok(end < n && end <= 4096);
    let p = 4 + header.len, doc = false;
    while (p < end) {
      const id = vint(p, true); p += id.len; const size = vint(p); p += size.len;
      ok(p + size.value <= end); if (id.value === 0x4282) { ok(text(p, size.value) === 'webm'); doc = true; } p += size.value;
    }
    ok(doc && end + 5 <= n && u32(end) === 0x18538067);
    const segment = vint(end + 4); p = end + 4 + segment.len;
    // Unknown-length Segment is normal for streaming WebM; bound all children
    // to the downloaded object and require Info, Tracks and a media Cluster.
    const unknown = segment.value === 2 ** (7 * segment.len) - 1;
    ok(unknown || p + segment.value === n);
    let info = false, tracks = false, cluster = false;
    while (p < n) {
      const id = vint(p, true); p += id.len; const size = vint(p); p += size.len;
      ok(size.value > 0 && size.value <= n - p);
      if (id.value === 0x1549a966) info = true;
      if (id.value === 0x1654ae6b) tracks = true;
      if (id.value === 0x1f43b675) cluster = true;
      p += size.value;
    }
    ok(info && tracks && cluster && p === n);
  }
  return mime;
}
