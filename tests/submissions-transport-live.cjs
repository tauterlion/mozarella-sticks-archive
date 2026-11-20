// Chromium + real browser TUS + local Docker Storage. PostgreSQL fixtures are
// isolated in PGlite; only the challenge provider is stubbed. No owner data writes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {execFileSync,execFile}=require('node:child_process');
const {crc32}=require('node:zlib');
const {createHash}=require('node:crypto');
const {setTimeout:delay}=require('node:timers/promises');
const {PGlite}=require('../supabase/tooling/node_modules/@electric-sql/pglite');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const storage='http://localhost:54321', chunk=6*1024*1024, limit=50*1024*1024;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=','base64');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(size) {
 const padding=Buffer.alloc(size-png.length,32);
 padding.writeUInt32BE(padding.length-12);padding.write('tEXtNote',4);padding[12]=0;
 padding.writeUInt32BE(crc32(padding.subarray(4,-4)),padding.length-4);
 return Buffer.concat([png.subarray(0,33),padding,png.subarray(33)]);
}
function inventory() {
 const sql="select json_agg(o order by name) from (select name,id,metadata from storage.objects where bucket_id='aoms-submissions') o";
 return execFileSync('docker',['exec','supabase_db_aoms-local','psql','-X','-U','postgres','-d','postgres','-tAc',sql],{encoding:'utf8'}).trim();
}
async function main(){
 assert.equal(process.env.AOMS_BROWSER_STORAGE_TEST,'1','Opt in with AOMS_BROWSER_STORAGE_TEST=1');
 const local=JSON.parse(fs.readFileSync(path.resolve(root,'../work/aoms-local/status.json'),'utf8').replace(/^\uFEFF/,''));
 assert.ok([storage,'http://127.0.0.1:54321'].includes(local.API_URL));
 const headers={apikey:local.SERVICE_ROLE_KEY,Authorization:'Bearer '+local.SERVICE_ROLE_KEY,'Content-Type':'application/json'};
 const {createHandler}=await import('../supabase/functions/community-submit/handler.mjs');
 const {removePrivateObject}=await import('../supabase/tooling/private-object-cleanup.mjs');
 const {runRetention}=await import('../supabase/tooling/cleanup.mjs');
 const db=new PGlite(), objects=new Set(), stats=[], original=inventory();
 const bodyFor=async(req)=>{const pieces=[];for await(const piece of req)pieces.push(piece);return Buffer.concat(pieces);};
 const signature=async(object)=>{
  objects.add(object);
  const response=await fetch(storage+'/storage/v1/object/upload/sign/aoms-submissions/'+object,{method:'POST',headers,body:'{}'});
  assert.ok(response.ok,'Storage signature failed');
  return new URL((await response.json()).url,storage).searchParams.get('token');
 };
 let server,browser,stopStats,fixtureDir;
 try{
  for(const source of ['supabase/tests/audited-baseline.sql',...fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>'supabase/migrations/'+f)]){
   await db.exec(fs.readFileSync(path.join(root,source),'utf8'));
  }
  await db.exec('update public.submission_settings set intake_enabled=true');
  let origin, handler;
  server=http.createServer(async(req,res)=>{
   try{
    const pathname=new URL(req.url,origin).pathname;
    if(pathname==='/test-intake'){
     const response=await handler(new Request(origin+pathname,{method:req.method,headers:req.headers,body:await bodyFor(req)}));
     res.writeHead(response.status,Object.fromEntries(response.headers));return res.end(Buffer.from(await response.arrayBuffer()));
    }
    if(pathname==='/data/submissions-config.json'){
     res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({enabled:true,turnstileSitekey:'local-fixture',endpoint:origin+'/test-intake'}));
    }
    const file=path.resolve(root,'.'+pathname);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
    const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'};
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
   } catch {res.writeHead(500);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  const rpc=async(action,payload={})=>{
   const sql=action==='recover'?'select public.submission_expired_outcome($1,$2::uuid) result':'select public.submission_intake($1,$2::jsonb) result';
   const args=action==='recover'?[payload.capabilityHash,payload.clientFileId]:[action,JSON.stringify(payload)];
   return (await db.query(sql,args)).rows[0].result;
  };
  let verificationOutage=true;
  handler=createHandler({origin,hostname:'localhost',turnstileSecret:'test-provider-only',rpc,
   fetcher:async()=>Response.json({success:true,hostname:'localhost',action:'aoms_submission',challenge_ts:new Date().toISOString()}),
   sign:async(object,mime)=>({endpoint:storage+'/storage/v1/upload/resumable/sign',token:await signature(object),bucket:'aoms-submissions',path:object,mime}),
   download:async object=>{
    const response=await fetch(storage+'/storage/v1/object/authenticated/aoms-submissions/'+object,{headers});
    if(response.ok && verificationOutage){verificationOutage=false;await response.body.cancel();return new Response(null,{status:503});}
    return response;
   }});
  browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
  const page=await browser.newPage();
  await page.route('https://challenges.cloudflare.com/**',r=>r.fulfill({contentType:'text/javascript',body:`
   let challenge,index=0;
   window.turnstile={render:(s,o)=>{challenge=o;queueMicrotask(()=>o.callback('fixture-token-'+crypto.randomUUID()+'-'+(++index)));return 0;},
    reset:()=>setTimeout(()=>challenge.callback('fixture-token-'+crypto.randomUUID()+'-'+(++index)),100)};
   window.expireFixtureChallenge=()=>challenge['expired-callback']();`}));
  const resource=()=>execFile('docker',['stats','--no-stream','--format','{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}|{{.BlockIO}}','supabase_storage_aoms-local'],{timeout:6000},(e,stdout)=>{if(!e)stats.push(stdout.trim());});
  resource();stopStats=setInterval(resource,2000);
  const offsets=[], headRequests=[];
  page.on('request',request=>{
   if(request.url().startsWith(storage)&&request.method()==='PATCH') offsets.push(Number(request.headers()['upload-offset']));
   if(request.url().startsWith(storage)&&request.method()==='HEAD') headRequests.push(request.url());
  });
  let mode='interrupt', firstAbort=false, duringChunk, readyForCancellation;
  await page.route('**/storage/v1/upload/resumable/sign/**',async route=>{
   if(route.request().method()!=='PATCH')return route.continue();
   const offset=Number(route.request().headers()['upload-offset']);
   if(mode==='interrupt'&&offset>=chunk&&!firstAbort){firstAbort=true;return route.abort('connectionreset');}
   if(mode==='cancel'&&offset>=chunk){readyForCancellation?.();await duringChunk;return route.abort('aborted').catch(()=>{});}
   await delay(300);return route.continue();
  });
  fixtureDir=fs.mkdtempSync(path.join(os.tmpdir(),'aoms-browser-'));
  async function prepare(filename,buffer){
   const file=path.join(fixtureDir,filename);fs.writeFileSync(file,buffer);
   await page.goto(origin+'/submit.html');await page.locator('#files').setInputFiles(file);
   const card=page.locator('.submission-file');
   await card.getByLabel('Caption',{exact:true}).fill('Disposable transport integration');
   await card.getByLabel('Event',{exact:true}).selectOption('halloween-sleepovers-2026');
   await card.getByLabel('No people to tag').check();await page.locator('#consent').check();
   await page.waitForFunction(()=>!document.querySelector('#send-files').disabled);
   return card;
  }
  const data=fixture(limit);
  await prepare('browser-limit.png',data);
  await page.evaluate(()=>window.expireFixtureChallenge());
  await page.getByText('The security check expired. Complete the new check or select Refresh security check.',{exact:true}).waitFor();
  assert.equal(await page.locator('#send-files').isDisabled(),true);
  await page.getByRole('button',{name:'Refresh security check',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#send-files').disabled);
  const heldSubmit=page.locator('#send-files');
  const deadline=new Date(Date.now()+301000);
  await page.clock.setFixedTime(deadline);
  await page.evaluate(()=>document.querySelector('#submission-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(await heldSubmit.isDisabled(),true);
  assert.equal((await db.query('select count(*)::int n from public.submission_batches')).rows[0].n,0);
  assert.equal(await page.locator('.submission-file textarea').first().inputValue(),'Disposable transport integration');
  await page.getByRole('button',{name:'Refresh security check',exact:true}).click();
  await page.getByText('Security check complete.',{exact:true}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('#send-files').disabled);
  console.log('PASS expired token cannot create a batch without the widget callback; manual renewal preserves the queue');
  console.log('PASS real browser refreshes fixture challenge after simulated expiry');
  const start=performance.now();
  await page.locator('#send-files').click();
  await page.getByText('The upload is not complete yet. Retry to continue.',{exact:true}).first().waitFor({timeout:60000});
  const patchesBeforeRetry=offsets.length;
  await page.locator('#send-files').click();
  await page.getByText('Received privately · awaiting review',{exact:true}).waitFor({timeout:60000});
  assert.equal(offsets.length,patchesBeforeRetry,'Verification outage recovery must reuse stored bytes');
  console.log('PASS real browser retries a simulated Storage read outage without retransferring bytes');
  const seconds=(performance.now()-start)/1000;
  const item=(await db.query("select file_sha256,status from public.media_submissions where original_filename='browser-limit.png'")).rows[0];
  assert.equal(item.status,'pending');assert.equal(item.file_sha256,sha(data));
  assert.ok(firstAbort&&headRequests.length&&offsets.filter(x=>x===chunk).length>1,'TUS must resume the same stored offset after a dropped chunk');
  console.log(JSON.stringify({scenario:'50 MiB real browser transfer with injected chunk delay, one disconnect and one validation retry',seconds:Math.round(seconds*100)/100,effectiveMiBPerSecond:Math.round(5000/seconds)/100,patchAttempts:offsets.length,storageSamples:stats}));

  mode='cancel';let release;
  duringChunk=new Promise(resolve=>{release=resolve;});
  const cancelling=new Promise(resolve=>{readyForCancellation=resolve;});
  const card=await prepare('browser-cancel.png',fixture(2*chunk));
  await page.locator('#send-files').click();await Promise.race([cancelling,delay(20000,undefined,{ref:false}).then(()=>{throw Error('Active browser transfer did not reach its second chunk');})]);
  await card.getByRole('button',{name:'Cancel',exact:true}).click();release();
  await card.getByText('Cancelled. The private upload will be cleaned up.',{exact:true}).waitFor();
  const cancelled=(await db.query("select status,finalized_at from public.media_submissions where original_filename='browser-cancel.png'")).rows[0];
  assert.equal(cancelled.status,'failed');assert.equal(cancelled.finalized_at,null);
  console.log('PASS actual browser cancelled a live TUS upload; database never finalized it');

  duringChunk=new Promise(resolve=>{release=resolve;});
  const refreshing=new Promise(resolve=>{readyForCancellation=resolve;});
  await prepare('browser-refresh.png',fixture(2*chunk));
  await page.locator('#send-files').click();await Promise.race([refreshing,delay(20000,undefined,{ref:false}).then(()=>{throw Error('Refresh did not reach an active transfer');})]);
  let warned=false;
  page.once('dialog',async dialog=>{warned=dialog.type()==='beforeunload';await dialog.accept();});
  await page.reload();release();
  assert.ok(warned);assert.equal(await page.locator('.submission-file').count(),0);
  const abandoned=(await db.query("select status,finalized_at from public.media_submissions where original_filename='browser-refresh.png'")).rows[0];
  assert.equal(abandoned.status,'uploading');assert.equal(abandoned.finalized_at,null);
  const sessions=await page.evaluate(()=>[Object.keys(localStorage),Object.keys(sessionStorage)]);
  assert.equal(sessions.flat().some(key=>/tus|capability|batch/i.test(key)),false);
  console.log('PASS reloading warned, cleared the in-memory queue and left only an abandoned reservation');

  mode='pass';
  await prepare('browser-rollover.png',fixture(2*chunk));
  let aged=false;
  await page.route('**/test-intake',async route=>{
   const payload=route.request().postDataJSON();
   if(payload.action==='complete' && !aged && offsets.at(-1)===chunk){
    // A test clock, applied only to this harness database and selected fixture.
    const updated=await db.query("update public.submission_batches b set created_at=now()-interval '3 hours', expires_at=now()-interval '1 hour', captcha_verified_at=now()-interval '3 hours' from public.media_submissions m where m.id=$1 and m.batch_id=b.id and m.original_filename='browser-rollover.png'",[payload.id]);
    // Only age after the second real Storage chunk for this file finishes.
    aged=updated.affectedRows===1;
   }
   return route.continue();
  });
  // Avoid reusing the previous scenario's last observed offset.
  offsets.length=0;
  await page.locator('#send-files').click();
  await page.getByText('Complete a new security check, then use Send for review to continue the remaining files.',{exact:true}).first().waitFor({timeout:30000});
  await page.waitForFunction(()=>!document.querySelector('#send-files').disabled);
  await page.locator('#send-files').click();
  await page.getByText('Received privately · awaiting review',{exact:true}).waitFor({timeout:30000});
  const rolled=(await db.query("select status,finalized_at from public.media_submissions where original_filename='browser-rollover.png' order by created_at")).rows;
  assert.equal(rolled.length,2);assert.equal(rolled[0].finalized_at,null);assert.equal(rolled[1].status,'pending');
  console.log('PASS actual browser and Storage rollover under a simulated batch expiry; only the new batch finalized');

  const retention=async(action,payload={})=>(await db.query('select public.submission_retention($1,$2::jsonb) result',[action,JSON.stringify(payload)])).rows[0].result;
  const old=(await db.query("select id,batch_id,storage_path from public.media_submissions where original_filename='browser-rollover.png' and finalized_at is null")).rows[0];
  assert.ok(objects.has(old.storage_path));
  const safeRemove=async object=>{assert.equal(object,old.storage_path);await removePrivateObject(storage,headers,object);};
  await db.exec("update public.submission_settings set abandoned_retention=interval '0 seconds'");
  await db.query("update public.submission_batches set created_at=now()-interval '27 hours',expires_at=now()-interval '25 hours',captcha_verified_at=now()-interval '27 hours' where id=$1",[old.batch_id]);
  const tooEarly=await runRetention({rpc:retention,remove:()=>assert.fail('late-token horizon should protect the object'),apply:true});
  assert.equal(tooEarly.claimed,0);
  await db.query("update public.submission_batches set created_at=now()-interval '30 hours',expires_at=now()-interval '28 hours',captcha_verified_at=now()-interval '30 hours' where id=$1",[old.batch_id]);
  const outage=await runRetention({rpc:retention,apply:true,remove:()=>{throw Error('Simulated worker interruption');}});
  assert.equal(outage.failed,1);assert.equal((await retention('report')).awaitingCleanup,1);
  const extra=await runRetention({rpc:retention,apply:true,remove:()=>assert.fail('lease must block duplicate work')});
  assert.equal(extra.claimed,0);
  await db.query("update public.media_submissions set storage_purge_lease_until=now()-interval '1 second' where id=$1",[old.id]);
  const reclaimed=await runRetention({rpc:retention,remove:safeRemove,apply:true});
  assert.equal(reclaimed.released,1);assert.equal((await retention('report')).awaitingCleanup,0);
  assert.equal((await db.query("select count(*)::int n from public.media_submissions where status='pending'")).rows[0].n,2);
  assert.ok((await db.query('select count(*)::int n from public.submission_audit where submission_id=$1',[old.id])).rows[0].n>1);
  console.log('PASS worker honors the simulated 26-hour boundary, retries an expired lease, removes the real disposable object and preserves pending files and audit');

  const malformed={rejected:0,throttled:0};
  const burstStart=performance.now();
  for(let i=0;i<65;i++){
   const r=await fetch(origin+'/test-intake',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
   assert.ok([400,429].includes(r.status));malformed[r.status===400?'rejected':'throttled']++;await r.body.cancel();
  }
  assert.ok(malformed.throttled>0);
  console.log(JSON.stringify({scenario:'65 bounded malformed requests against harness only',...malformed,milliseconds:Math.round(performance.now()-burstStart)}));
 }finally{
  clearInterval(stopStats);await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  for(const object of objects)await removePrivateObject(storage,headers,object);
  assert.equal(inventory(),original,'Owner object inventory must be unchanged');await db.close();
  if(fixtureDir){for(const file of fs.readdirSync(fixtureDir))fs.unlinkSync(path.join(fixtureDir,file));fs.rmdirSync(fixtureDir);}
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
