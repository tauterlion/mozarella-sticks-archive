const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.resolve(root,'../outputs/community-submissions');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=','base64');
const fixture=(name='memory.png')=>({name,mimeType:'image/png',buffer:png});
(async()=>{
 fs.mkdirSync(output,{recursive:true});const fixturePath=path.join(output,'memory.png');fs.writeFileSync(fixturePath,png);let browser,checks=0;
 const server=http.createServer((req,res)=>{let p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(p,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png'})[path.extname(p)]||'application/octet-stream');res.end(data);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;
 const check=(name,value)=>{assert.ok(value,name);checks++;console.log('PASS '+name);};
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let external=0;page.on('request',r=>{if(r.url().includes('supabase.co')||r.url().includes('cloudflare.com'))external++;});
  await page.goto(base+'submit.html');await page.waitForFunction(()=>document.querySelector('#files')&&!document.querySelector('#files').disabled);
  await page.waitForTimeout(200);
  await page.locator('#files').setInputFiles(fixturePath);await page.locator('.submission-file').waitFor();
  check('all 112 events and proposal are available',await page.locator('.submission-file select option').count()===114);
  check('all 37 canonical people are available',await page.locator('.submission-people input').count()===37);
  await page.locator('#files').setInputFiles(fixturePath);check('duplicate selection rejected',await page.locator('.submission-file').count()===1);
  await page.locator('#files').setInputFiles([fixture('second.png')]);
  const first=page.locator('.submission-file').first();
  await first.getByLabel('Caption',{exact:true}).fill('A memory for the archive.');await first.getByLabel('Event',{exact:true}).selectOption('closeup-departure');
  await first.getByLabel('No people to tag').check();await first.getByRole('button',{name:'Apply details to all'}).click();
  check('apply details copies per file metadata',await page.locator('.submission-file').nth(1).getByLabel('Caption',{exact:true}).inputValue()==='A memory for the archive.');
  await page.locator('#consent').check();check('closed form cannot send',await page.locator('#send-files').isDisabled());check('closed form never loads challenge or contacts backend',external===0);
  for(const theme of ['dark','light'])for(const mobile of [false,true]){
   await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(350);
   check(`${theme} ${mobile?'mobile':'desktop'} no horizontal overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});
   await page.screenshot({path:path.join(output,`${theme}-${mobile?'mobile':'desktop'}.png`),fullPage:true});
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.keyboard.press('Tab');check('keyboard has a visible focus target',await page.evaluate(()=>document.activeElement!==document.body));
  await first.getByLabel('Event',{exact:true}).selectOption('__propose');check('proposal fields become required',await first.getByLabel('Proposed event title').evaluate(e=>e.required));
  const {inspectMedia}=await import('../supabase/functions/community-submit/validation.mjs');
  for(const mime of ['image/jpeg','image/png','image/webp']) {
   const bytes=Uint8Array.from(await page.evaluate(type=>{const c=document.createElement('canvas');c.width=c.height=16;c.getContext('2d').fillRect(0,0,16,16);return [...Uint8Array.from(atob(c.toDataURL(type).split(',')[1]),ch=>ch.charCodeAt(0))];},mime));
   check(`${mime} real browser-encoded file passes structural checks`,inspectMedia(bytes,mime,bytes.length)===mime);
   assert.throws(()=>inspectMedia(bytes.slice(0,-3),mime,bytes.length-3));
  }
  const webm=Uint8Array.from(await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=c.height=16;const ctx=c.getContext('2d');ctx.fillRect(0,0,16,16);const stream=c.captureStream(10),rec=new MediaRecorder(stream,{mimeType:'video/webm'}),parts=[];rec.ondataavailable=e=>parts.push(e.data);const done=new Promise(resolve=>rec.onstop=resolve);rec.start();await new Promise(r=>setTimeout(r,250));ctx.fillStyle='red';ctx.fillRect(0,0,16,16);await new Promise(r=>setTimeout(r,250));rec.stop();await done;stream.getTracks().forEach(t=>t.stop());return [...new Uint8Array(await new Blob(parts).arrayBuffer())];}));
  check('real browser-recorded WebM passes structural checks',inspectMedia(webm,'video/webm',webm.length)==='video/webm');
  const media=JSON.parse(fs.readFileSync(path.join(root,'data/media.json'))).media;
  const video=media.find(m=>m.available!==false&&/\.mp4$/i.test(m.file));
  const mp4=new Uint8Array(fs.readFileSync(path.join(root,video.path||'assets/media/'+video.file)));
  check('original MP4 passes structural checks',inspectMedia(mp4,'video/mp4',mp4.length)==='video/mp4');
  // Explicit test-only network stubs: the repository config remains disabled.
  await page.route('**/data/submissions-config.json',r=>r.fulfill({json:{enabled:true,turnstileSitekey:'test-only',endpoint:base+'mock-intake'}}));
  await page.route('https://challenges.cloudflare.com/**',r=>r.fulfill({contentType:'text/javascript',body:'window.turnstile={render:(s,o)=>{setTimeout(()=>o.callback("test-token"),0);return 1;},reset:()=>{}};'}));
  await page.route('**/scripts/vendor/tus-4.3.1.min.js',r=>r.fulfill({contentType:'text/javascript',body:'window.tus={Upload:class {constructor(f,o){this.options=o;}start(){window.transferAttempts=(window.transferAttempts||0)+1;setTimeout(()=>{if(window.transferAttempts===1)this.options.onError();else {this.options.onProgress(1,1);window.transferred=true;this.options.onSuccess();}},10);}abort(){return Promise.resolve();}}};'}));
  let authorized=0,completeCalls=0,receiptSent=false;const clientIDs=new Set();
  await page.route('**/mock-intake',async r=>{
   const b=r.request().postDataJSON();let json={},status=200;
   if(b.action==='resume'){status=401;json={error:'batch_expired'};}
   if(b.action==='batch')json={receipt:'anonymous-test-reference',expiresAt:new Date(Date.now()+7200000).toISOString()};
   if(b.action==='authorize'){authorized++;clientIDs.add(b.clientFileId);json=receiptSent?{status:'pending',receipt:'anonymous-test-reference'}:{id:'11111111-1111-4111-8111-111111111111',upload:{endpoint:base+'tus',token:'scoped-token',bucket:'aoms-submissions',path:'incoming/test/test',mime:'image/png'}};}
   if(b.action==='complete'){completeCalls++;if(await page.evaluate(()=>!!window.transferred)){receiptSent=true;status=503;json={error:'temporarily_unavailable'};}else{status=409;json={error:'upload_not_ready'};}}
   await r.fulfill({status,json});
  });
  await page.reload();await page.waitForTimeout(200);await page.locator('#files').setInputFiles(fixture());
  const card=page.locator('.submission-file');await card.getByLabel('Caption',{exact:true}).fill('<img src=x onerror=alert(1)>');await card.getByLabel('Event',{exact:true}).selectOption('closeup-departure');await card.getByLabel('No people to tag').check();await page.locator('#consent').check();
  await page.locator('#send-files').click();await page.getByText('Transfer interrupted. Retry to continue this file.').waitFor();
  check('interrupted transfer offers retry',await page.locator('#send-files').isEnabled());
  await page.locator('#send-files').click();await page.getByText('The connection was interrupted. Please retry.').waitFor();
  await page.locator('#send-files').click();await page.getByText('Received privately · awaiting review').waitFor();
  check('lost completion response recovers without duplicate upload',clientIDs.size===1&&authorized===3&&await page.evaluate(()=>window.transferAttempts===2));
  check('anonymous receipt shown',await page.locator('#receipt-reference').textContent()==='Reference: anonymous-test-reference');
  check('caption treated as text',await page.locator('.submission-file img[src=x]').count()===0);
  await page.route('**/mock-intake',r=>r.fulfill({status:401,json:{error:'batch_expired'}}));
  await page.reload();await page.waitForTimeout(200);await page.locator('#files').setInputFiles(fixture());
  await page.locator('.submission-file').getByLabel('Caption',{exact:true}).fill('A memory');await page.locator('.submission-file').getByLabel('Event',{exact:true}).selectOption('closeup-departure');await page.locator('.submission-file').getByLabel('No people to tag').check();await page.locator('#consent').check();
  await page.locator('#send-files').click();await page.getByText('This upload session expired.',{exact:false}).waitFor();
  check('expired permission shows recovery without transferring',await page.evaluate(()=>!window.transferAttempts));
  check('no browser exceptions',errors.length===0);
  fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({checks,errors,mode:'local browser; mocked Turnstile, gateway and TUS transport'},null,2));
  console.log(`${checks} submission browser checks passed; screenshots: ${output}`);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1);});
