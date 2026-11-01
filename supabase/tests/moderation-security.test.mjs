import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewHandler } from '../functions/community-review/handler.mjs';
const origin = 'http://localhost:8766';
const userId = '11111111-1111-4111-8111-111111111111', sessionId = '22222222-2222-4222-8222-222222222222';
const identity = { userId, sessionId, aal: 'aal2' };
const token = 'signed-token-placeholder';
function setup(overrides = {}) {
  const calls = [];
  const handler = createReviewHandler({ origin,
    authenticate: async () => identity,
    read: async (who, action, payload) => { calls.push({ who, action, payload }); return action === 'preview' ? { path: 'incoming/private' } : { items: [] }; },
    sign: async () => 'https://local/private-expiring', ...overrides });
  const request = (body = { action: 'session' }, headers = {}, method = 'POST') => handler(new Request(origin, {
    method, headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) }));
  return { request, calls };
}
test('missing bearer cannot access data', async () => { const s=setup(); assert.equal((await s.request(undefined,{Authorization:''})).status,401); assert.equal(s.calls.length,0); });
test('invalid Auth token cannot access data', async () => { const s=setup({authenticate:async()=>null}); assert.equal((await s.request()).status,401); assert.equal(s.calls.length,0); });
test('password-only session rejected', async () => { const s=setup({authenticate:async()=>({...identity,aal:'aal1'})}); assert.equal((await s.request()).status,403); assert.equal(s.calls.length,0); });
test('missing live session identity rejected', async () => { const s=setup({authenticate:async()=>({...identity,sessionId:null})}); assert.equal((await s.request()).status,401); });
test('disallowed origin rejected without CORS', async () => { const s=setup(); const r=await s.request(undefined,{Origin:'https://evil.test'}); assert.equal(r.status,403); assert.equal(r.headers.get('access-control-allow-origin'),null); });
test('preflight exact origin only', async () => { const s=setup(); const r=await s.request(undefined,{},'OPTIONS'); assert.equal(r.status,204); assert.equal(r.headers.get('access-control-allow-origin'),origin); });
test('GET does not expose data', async () => { assert.equal((await setup().request(undefined,{},'GET')).status,405); });
for (const body of [{action:'approve'},{action:'publish'}, {action:'session',userId:'forged'}, {action:'preview',id:userId,path:'other'}, {action:'list',status:'uploading',page:0}, {action:'list',status:'pending',page:-1}, {action:'list',status:'pending',page:0.5}, {action:'detail',id:'../other'}, {action:'detail',id:[userId]}, null, [], '{invalid', 'x'.repeat(2049)]) {
  test(`reject unsafe request ${JSON.stringify(body).slice(0,70)}`,async()=> { const s=setup(); assert.equal((await s.request(body)).status,400); assert.equal(s.calls.length,0); });
}
test('allowlist/session revocation denies previews before signing',async()=> { let signed=false; const s=setup({read:async()=>({error:'forbidden'}),sign:async()=>{signed=true;}}); assert.equal((await s.request({action:'preview',id:userId})).status,403); assert.equal(signed,false); });
test('verified identity is used, responses never cached',async()=> { const s=setup(); const r=await s.request({action:'list',status:'pending',page:0}); assert.equal(r.status,200); assert.equal(r.headers.get('cache-control'),'no-store'); assert.deepEqual(s.calls[0].who,identity); });
test('preview exposes only expiring URL, not internal RPC path',async()=> { const s=setup(); const data=await (await s.request({action:'preview',id:userId})).json(); assert.deepEqual(data,{url:'https://local/private-expiring',expiresIn:60}); });
test('backend failure is sanitized',async()=> { const s=setup({read:async()=>{throw Error('service secret');}}); const r=await s.request(); assert.equal(r.status,503); assert.deepEqual(await r.json(),{error:'review_unavailable'}); });
