import { createHandler } from './handler.mjs';
import { IntakeError } from './validation.mjs';

const url = Deno.env.get('SUPABASE_URL') || '';
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const storagePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
Deno.serve(createHandler({
  origin: Deno.env.get('SUBMISSIONS_ORIGIN') || 'https://tauterlion.github.io',
  hostname: Deno.env.get('TURNSTILE_HOSTNAME') || 'tauterlion.github.io',
  turnstileSecret: Deno.env.get('TURNSTILE_SECRET_KEY'),
  async rpc(action: string, payload: object) {
    const response = await fetch(`${url}/rest/v1/rpc/submission_intake`, {
      method: 'POST', headers, body: JSON.stringify({ action, payload }), signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      if (response.status === 400 || response.status === 409) throw new IntakeError('invalid_request');
      throw new Error('database_unavailable');
    }
    return response.json();
  },
  async sign(path: string, mime: string) {
    const response = await fetch(`${url}/storage/v1/object/upload/sign/aoms-submissions/${storagePath(path)}`, {
      method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('storage_unavailable');
    const data = await response.json();
    const signed = new URL(data.url, `${url}/storage/v1`);
    const token = signed.searchParams.get('token');
    if (!token) throw new Error('storage_unavailable');
    return { endpoint: `${url.replace('.supabase.co', '.storage.supabase.co')}/storage/v1/upload/resumable`,
      token, bucket: 'aoms-submissions', path, mime };
  },
  download(path: string) {
    return fetch(`${url}/storage/v1/object/authenticated/aoms-submissions/${storagePath(path)}`, {
      headers, signal: AbortSignal.timeout(90000)
    });
  }
}));
