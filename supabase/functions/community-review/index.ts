import { createReviewHandler } from './handler.mjs';
const url = Deno.env.get('SUPABASE_URL') || '';
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const publicStorageURL = Deno.env.get('SUBMISSIONS_STORAGE_PUBLIC_URL') || url;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
Deno.serve(createReviewHandler({
  origin: Deno.env.get('SUBMISSIONS_ORIGIN') || 'https://tauterlion.github.io',
  async authenticate(token: string) {
    // Auth validates signature/expiry/user. Never authorize from a decoded token alone.
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000)
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error('auth_unavailable');
    const user = await response.json();
    const part = token.split('.')[1];
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    if (user.id !== claims.sub || claims.role !== 'authenticated' || user.is_anonymous ||
        !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) return null;
    return { userId: user.id, sessionId: claims.session_id, aal: claims.aal };
  },
  async read(identity: { userId: string; sessionId: string }, action: string, payload: object) {
    const response = await fetch(`${url}/rest/v1/rpc/submission_review_read`, {
      method: 'POST', headers, body: JSON.stringify({ actor: identity.userId, session: identity.sessionId, action, payload }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('database_unavailable');
    return response.json();
  },
  async sign(path: string) {
    const response = await fetch(`${url}/storage/v1/object/sign/aoms-submissions/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST', headers, body: JSON.stringify({ expiresIn: 60 }), signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('storage_unavailable');
    const data = await response.json();
    const signed = data.signedURL || data.signedUrl;
    if (typeof signed !== 'string' || !signed.startsWith('/object/sign/aoms-submissions/')) throw new Error('invalid_preview');
    return `${publicStorageURL}/storage/v1${signed}`;
  }
}));
