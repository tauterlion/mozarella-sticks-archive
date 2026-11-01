const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = ['pending', 'approved', 'rejected', 'published', 'removed'];

export function createReviewHandler({ origin, authenticate, read, sign }) {
  return async request => {
    const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json', 'Vary': 'Origin' };
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (request.headers.get('Origin') !== origin) return reply({ error: 'forbidden' }, 403);
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'authorization, content-type';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
    try {
      const bearer = request.headers.get('Authorization') || '';
      if (!/^Bearer [A-Za-z0-9._-]{20,8192}$/.test(bearer)) return reply({ error: 'unauthorized' }, 401);
      // authenticate must verify with Auth before returning token claims.
      const identity = await authenticate(bearer.slice(7));
      if (!identity || !UUID.test(identity.userId) || !UUID.test(identity.sessionId)) return reply({ error: 'unauthorized' }, 401);
      if (identity.aal !== 'aal2') return reply({ error: 'mfa_required' }, 403);
      if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return reply({ error: 'invalid_request' }, 400);
      const reader = request.body?.getReader();
      if (!reader) return reply({ error: 'invalid_request' }, 400);
      let bytes = 0, chunks = [];
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 2048) { await reader.cancel(); return reply({ error: 'invalid_request' }, 400); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      let body;
      try { body = JSON.parse(new TextDecoder().decode(Uint8Array.from(chunks.flatMap(c => [...c])))); }
      catch { return reply({ error: 'invalid_request' }, 400); }
      if (!body || Array.isArray(body) || typeof body !== 'object') return reply({ error: 'invalid_request' }, 400);
      const { action } = body;
      const allowed = { session: ['action'], list: ['action','status','page'], detail: ['action','id'], preview: ['action','id'] };
      if (!Object.hasOwn(allowed, action) || Object.keys(body).some(k => !allowed[action].includes(k))) return reply({ error: 'invalid_request' }, 400);
      if (action === 'list' && (!statuses.includes(body.status) || !Number.isInteger(body.page) || body.page < 0 || body.page > 10000)) return reply({ error: 'invalid_request' }, 400);
      if (['detail','preview'].includes(action) && (typeof body.id !== 'string' || !UUID.test(body.id))) return reply({ error: 'invalid_request' }, 400);
      const { action: unused, ...payload } = body;
      const result = await read(identity, action, payload);
      if (result.error) return reply({ error: result.error }, result.error === 'forbidden' ? 403 : result.error === 'not_found' ? 404 : 400);
      if (action === 'preview') return reply({ url: await sign(result.path), expiresIn: 60 });
      return reply(result);
    } catch { return reply({ error: 'review_unavailable' }, 503); }
  };
}
