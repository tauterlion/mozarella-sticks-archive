import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BYTES, validateRequest, verifyChallenge, boundedBytes, inspectMedia } from '../functions/community-submit/validation.mjs';
import { createHandler } from '../functions/community-submit/handler.mjs';
const capability='a'.repeat(64),id='11111111-1111-4111-8111-111111111111';
const valid={action:'authorize',capability,clientFileId:id,filename:'photo.jpg',mime:'image/jpeg',size:MAX_BYTES,caption:'A memory',eventId:'closeup-departure',people:['alejandro'],noPeople:false,proposedTitle:null,proposedDate:null,proposedDetails:null,consent:true};
test('50 MiB accepted, one byte over rejected',()=>{assert.equal(validateRequest(valid),valid);assert.throws(()=>validateRequest({...valid,size:MAX_BYTES+1}));});
for(const [label,patch] of Object.entries({
 'client status':{status:'approved'},'reviewer':{reviewed_by:id},'private path':{storage_path:'../elsewhere'},
 'filename traversal':{filename:'../a.jpg'},'SVG':{mime:'image/svg+xml'},'missing consent':{consent:false},
 'duplicate people':{people:['alejandro','alejandro']},'ambiguous event':{proposedTitle:'Other'},
 'blank caption':{caption:' '},'oversize caption':{caption:'a'.repeat(501)},'no people unconfirmed':{people:[]},
 'invalid date':{eventId:null,proposedTitle:'New event',proposedDetails:'Details',proposedDate:'2026-02-30'},
 'invalid capability':{capability:'guess'},'unknown action':{action:'approve'},'null people':{people:[null]}
}))test(`reject ${label}`,()=>assert.throws(()=>validateRequest({...valid,...patch})));
test('proposal and explicit none accepted',()=>assert.ok(validateRequest({...valid,eventId:null,people:[],noPeople:true,proposedTitle:'A gathering',proposedDate:null,proposedDetails:'A memory together'})));
test('Turnstile strict hostname/action/time/success',()=>{
 const good={success:true,hostname:'tauterlion.github.io',action:'aoms_submission',challenge_ts:new Date().toISOString()};
 verifyChallenge(good,'tauterlion.github.io');
 for(const patch of [{success:false},{hostname:'evil.test'},{action:'login'},{challenge_ts:new Date(Date.now()-300001).toISOString()},{challenge_ts:new Date(Date.now()+60000).toISOString()}])assert.throws(()=>verifyChallenge({...good,...patch},'tauterlion.github.io'));
});
test('stream over limit cancelled before unbounded buffering',async()=>{
 let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(11));},cancel(){cancelled=true;}});
 await assert.rejects(boundedBytes(stream,10));assert.ok(cancelled);
});
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=','base64'));
test('PNG structural validation accepts fixture, rejects truncation, mismatch and HTML',()=>{
 assert.equal(inspectMedia(png,'image/png',png.length),'image/png');
 assert.throws(()=>inspectMedia(png.slice(0,-1),'image/png',png.length-1));
 assert.throws(()=>inspectMedia(png,'image/jpeg',png.length));
 assert.throws(()=>inspectMedia(new TextEncoder().encode('<svg onload="evil()"/>'),'image/png',21));
 assert.throws(()=>inspectMedia(png,'image/png',png.length+1));
});
function setup(overrides={}) {
 const calls=[],deps={origin:'https://tauterlion.github.io',hostname:'tauterlion.github.io',turnstileSecret:'test-only',
 rpc:async(action,payload)=>{calls.push({action,payload});return action==='claim'?{id,path:'incoming/test/test',mime:'image/png',size:png.length,lease:id}:{ok:true};},
 sign:async()=>({token:'scoped-test-token'}),download:async()=>new Response(png),
 fetcher:async()=>Response.json({success:true,hostname:'tauterlion.github.io',action:'aoms_submission',challenge_ts:new Date().toISOString()}),...overrides};
 return {calls,handler:createHandler(deps)};
}
const request=(body,origin='https://tauterlion.github.io')=>new Request('https://test.invalid',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('disabled database switch blocks even valid requests before captcha or storage',async()=>{
 let contacted=false;const {handler}=setup({rpc:async()=>({error:'intake_disabled'}),sign:async()=>{contacted=true;}});
 assert.equal((await handler(request(valid))).status,503);assert.equal(contacted,false);
});
test('unknown origin denied before any database access',async()=>{const {handler,calls}=setup();assert.equal((await handler(request(valid,'https://evil.test'))).status,403);assert.equal(calls.length,0);});
test('missing Turnstile secret fails closed',async()=>{const {handler}=setup({turnstileSecret:''});assert.equal((await handler(request(valid))).status,503);});
test('invalid captcha never creates batch',async()=>{
 const {handler,calls}=setup({fetcher:async()=>Response.json({success:false})});
 assert.equal((await handler(request({action:'batch',capability,token:'forged',consent:true}))).status,400);
 assert.deepEqual(calls.map(c=>c.action),['tick']);
});
test('verified captcha creates batch using hashes, never raw tokens',async()=>{
 const {handler,calls}=setup();assert.equal((await handler(request({action:'batch',capability,token:'secret-test-token',consent:true}))).status,200);
 assert.equal(calls[1].action,'batch');assert.equal(calls[1].payload.capabilityHash.length,64);
 assert.ok(!JSON.stringify(calls).includes('secret-test-token'));assert.ok(!JSON.stringify(calls).includes(capability));
});
test('completion downloads server path and only requests pending finalization',async()=>{
 const {handler,calls}=setup();assert.equal((await handler(request({action:'complete',capability,id}))).status,200);
 assert.deepEqual(calls.map(c=>c.action),['tick','claim','finish']);assert.equal(calls[2].payload.sha256.length,64);
});
test('forged stored bytes are quarantined',async()=>{
 const {handler,calls}=setup({download:async()=>new Response(new Uint8Array(png.length))});
 assert.equal((await handler(request({action:'complete',capability,id}))).status,400);assert.equal(calls.at(-1).action,'invalid');
});
test('incomplete transfer remains retryable',async()=>{
 const {handler,calls}=setup({download:async()=>new Response('',{status:404})});
 assert.equal((await handler(request({action:'complete',capability,id}))).status,409);assert.equal(calls.at(-1).action,'release');
});
test('errors do not leak upstream secret or SQL',async()=>{
 const {handler}=setup({rpc:async()=>{throw Error('SECRET postgres details');}});
 const r=await handler(request(valid));assert.equal(r.status,503);assert.ok(!(await r.text()).includes('SECRET'));
});
test('expired permissions cannot reach stored objects',async()=>{
 let download=false;const {handler}=setup({rpc:async action=>action==='tick'?{ok:true}:{error:'batch_expired'},download:async()=>{download=true;return new Response(png);}});
 assert.equal((await handler(request({action:'complete',capability,id}))).status,401);assert.equal(download,false);
});
test('storage quota denial never issues a token',async()=>{
 let signed=false;const {handler}=setup({rpc:async action=>action==='tick'?{ok:true}:{error:'quota_exhausted'},sign:async()=>{signed=true;}});
 assert.equal((await handler(request(valid))).status,429);assert.equal(signed,false);
});
test('actual 50 MiB stream accepted, 50 MiB plus one byte rejected',async()=>{
 const stream=n=>new ReadableStream({start(c){c.enqueue(new Uint8Array(n));c.close();}});
 assert.equal((await boundedBytes(stream(MAX_BYTES),MAX_BYTES)).length,MAX_BYTES);
 await assert.rejects(boundedBytes(stream(MAX_BYTES+1),MAX_BYTES));
});
test('batch sends secret and token only to Cloudflare Siteverify',async()=>{
 let verified=false;
 const {handler}=setup({fetcher:async(url,options)=>{
  assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.equal(options.method,'POST');
  assert.equal(options.body.get('secret'),'test-only');
  assert.equal(options.body.get('response'),'widget-token');
  assert.equal(options.body.has('remoteip'),false);
  verified=true;
  return Response.json({success:true,hostname:'tauterlion.github.io',action:'aoms_submission',challenge_ts:new Date().toISOString()});
 }});
 const response=await handler(request({action:'batch',capability,token:'widget-token',consent:true}));
 assert.equal(response.status,200);assert.ok(verified);
 assert.ok(!(await response.text()).includes('test-only'));
});
for(const patch of [{hostname:'other.example'},{action:'other_action'},{challenge_ts:new Date(0).toISOString()},{success:false,'error-codes':['timeout-or-duplicate']}]) {
 test(`invalid Siteverify result cannot create a batch: ${JSON.stringify(patch)}`,async()=>{
  const {handler,calls}=setup({fetcher:async()=>Response.json({success:true,hostname:'tauterlion.github.io',action:'aoms_submission',challenge_ts:new Date().toISOString(),...patch})});
  assert.equal((await handler(request({action:'batch',capability,token:'widget-token',consent:true}))).status,400);
  assert.deepEqual(calls.map(c=>c.action),['tick']);
 });
}
