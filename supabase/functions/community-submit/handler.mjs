import { IntakeError, requireThat, validateRequest, verifyChallenge, sha256, boundedBytes, inspectMedia } from './validation.mjs';

// Dependency injection keeps production authorization and error paths testable.
export function createHandler({ origin, hostname, turnstileSecret, rpc, sign, download, fetcher = fetch }) {
  return async request => {
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    try {
      if (!origin || request.headers.get('origin') !== origin) return reply({ error: 'origin_denied' }, 403);
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'content-type';
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
      // This committed call gates every operation and counts malformed requests too.
      const call = async (action, payload = {}) => {
        const data = await rpc(action, payload);
        if (data.error) throw new IntakeError(data.error, ({intake_disabled:503, rate_limited:429, quota_exhausted:429, busy:409, batch_expired:401, upload_unavailable:404})[data.error] || 400);
        return data;
      };
      await call('tick');
      if (!turnstileSecret) throw new IntakeError('intake_disabled', 503);
      requireThat(request.headers.get('content-type')?.split(';')[0].trim() === 'application/json');
      const raw = await boundedBytes(request.body, 16384);
      let body; try { body = JSON.parse(new TextDecoder('utf-8', { fatal:true }).decode(raw)); } catch { throw new IntakeError('invalid_request'); }
      validateRequest(body);
      const capabilityHash = await sha256(body.capability);
      if (body.action === 'batch') {
        const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST', body: new URLSearchParams({ secret: turnstileSecret, response: body.token }), signal: AbortSignal.timeout(10000)
        });
        requireThat(response.ok, 'captcha_failed');
        const result = await response.json(); verifyChallenge(result, hostname);
        return reply(await call('batch', { capabilityHash, captchaHash: await sha256(body.token) }));
      }
      if (body.action === 'resume') return reply(await call('resume', { capabilityHash }));
      if (body.action === 'authorize') {
        const { action: _action, capability: _capability, ...metadata } = body;
        const item = await call('authorize', { ...metadata, capabilityHash });
        if (item.status === 'pending') return reply({ status: 'pending', receipt: item.receipt });
        // Only this uploader's opaque path is necessarily carried in its signed
        // write capability. No read URL, listing, service key or other record data.
        return reply({ id: item.id, upload: await sign(item.path, item.mime) });
      }
      if (body.action === 'cancel') return reply(await call('cancel', { capabilityHash, id: body.id }));
      const item = await call('claim', { capabilityHash, id: body.id });
      if (item.status === 'pending') return reply(item);
      const lease = { capabilityHash, id: item.id, lease: item.lease };
      let bytes;
      try {
        const response = await download(item.path);
        if (!response.ok) throw new Error('storage_unavailable');
        bytes = await boundedBytes(response.body, item.size);
        inspectMedia(bytes, item.mime, item.size);
      } catch (error) {
        if (error instanceof IntakeError) {
          await call('invalid', lease); throw new IntakeError('invalid_media');
        }
        await call('release', lease); throw new IntakeError('upload_not_ready', 409);
      }
      return reply(await call('finish', { ...lease, sha256: await sha256(bytes), mime: item.mime, size: bytes.length }));
    } catch (error) {
      // Never reflect upstream messages, filenames, secrets, tokens or SQL details.
      if (error instanceof IntakeError) return reply({ error: error.code }, error.status);
      return reply({ error: 'temporarily_unavailable' }, 503);
    }
  };
}
