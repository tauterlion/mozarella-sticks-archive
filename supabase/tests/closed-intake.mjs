// Read-only closed-intake smoke test. Never enables intake or uploads files.
import assert from 'node:assert/strict';
const endpoint='https://kvyrbtooynofijdtmqup.supabase.co/functions/v1/community-submit';
const origin='https://tauterlion.github.io';
const capability='0'.repeat(64);
for(const action of ['batch','resume','authorize','complete','cancel']) {
 const response=await fetch(endpoint,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action,capability}),signal:AbortSignal.timeout(30000)});
 assert.equal(response.status,503,action);assert.deepEqual(await response.json(),{error:'intake_disabled'});
 assert.equal(response.headers.get('access-control-allow-origin'),origin);
 assert.equal(response.headers.get('cache-control'),'no-store');
 console.log(`PASS ${action}: closed gateway refuses request`);
}
for(const suppliedOrigin of ['https://example.invalid','']) {
 const response=await fetch(endpoint,{method:'POST',headers: suppliedOrigin?{origin:suppliedOrigin}:{},body:'{}',signal:AbortSignal.timeout(30000)});
 assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'origin_denied'});
 assert.equal(response.headers.get('access-control-allow-origin'),null);
 console.log('PASS unapproved/missing origin denied');
}
const preflight=await fetch(endpoint,{method:'OPTIONS',headers:{origin,'Access-Control-Request-Method':'POST'},signal:AbortSignal.timeout(30000)});
assert.equal(preflight.status,204);console.log('PASS allowed preflight');
const get=await fetch(endpoint,{headers:{origin},signal:AbortSignal.timeout(30000)});
assert.equal(get.status,405);console.log('PASS GET denied');
console.log('9 live closed-intake checks passed; no upload capabilities issued');
