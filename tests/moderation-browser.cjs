const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.resolve(root,'../outputs/community-moderation');
(async()=>{
 let browser,checks=0;const check=(name,ok)=>{assert.ok(ok,name);checks++;console.log('PASS '+name);};
 const server=http.createServer((req,res)=>{const p=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!p.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(p,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html'})[path.extname(p)]||'application/octet-stream');res.end(data);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;
 try {
  browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));let external=0;page.on('request',r=>{if(r.url().includes('supabase.co'))external++;});
  await page.goto(base+'tools/submission-review.html');await page.getByText('Moderator review is not enabled in this environment.').waitFor();
  check('production config disables login',await page.locator('#login-panel').isHidden());check('closed page never contacts backend',external===0);
  await page.route('**/data/moderation-config.json',r=>r.fulfill({json:{enabled:true,supabaseUrl:'https://test.invalid',publishableKey:'public-test',endpoint:base+'review-api'}}));
  await page.route('**/scripts/vendor/supabase-2.118.0.min.js',r=>r.fulfill({contentType:'text/javascript',body:`window.supabase={createClient:(u,k,options)=>{window.authOptions=options;return {auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}}),signInWithPassword:async()=>({error:null}),signOut:async()=>({error:null}),onAuthStateChange:()=>{},mfa:{listFactors:async()=>({data:{totp:[{id:'factor',status:'verified'}]}}),challengeAndVerify:async()=>({error:null})}}}}};`}));
  const item={id:'11111111-1111-4111-8111-111111111111',caption:'<img src=x onerror=alert(1)>',original_filename:'private.png',status:'pending',mime_type:'image/png',file_size:100,event_id:'closeup-departure',people_ids:['alejandro']};let denied=false;
  await page.route('**/review-api',r=>{const body=r.request().postDataJSON();if(denied)return r.fulfill({status:403,json:{error:'forbidden'}});const result=body.action==='list'?{items:[item],total:1,pendingCount:1}:body.action==='detail'?{item}:body.action==='preview'?{url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=',expiresIn:60}:{ok:true};return r.fulfill({json:result});});
  await page.reload();await page.locator('#email').fill('moderator@example.invalid');await page.locator('#password').fill('local-test-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('#mfa-form').waitFor({state:'visible'});
  check('MFA required before queue visible',await page.locator('#review-panel').isHidden());
  check('password cleared after sign in',await page.locator('#password').inputValue()==='');
  await page.locator('#code').fill('123456');await page.getByRole('button',{name:'Verify',exact:true}).click();await page.locator('#queue button').waitFor();
  check('session persistence disabled',await page.evaluate(()=>authOptions.auth.persistSession===false&&authOptions.auth.detectSessionInUrl===false));
  check('caption rendered as plain text',await page.locator('#queue img').count()===0);
  check('queue pagination reflects one page',await page.locator('#previous').isDisabled()&&await page.locator('#next').isDisabled());
  await page.locator('#queue button').click();await page.locator('#detail').waitFor({state:'visible'});
  check('detail text safe from HTML injection',await page.locator('#metadata img').count()===0);
  await page.getByRole('button',{name:'Load private preview'}).click();await page.locator('#preview img').waitFor();
  check('preview can load after authorization',await page.locator('#preview img').count()===1);
  check('no approval or publication buttons',await page.getByRole('button',{name:/^(Approve|Reject|Publish)$/}).count()===0);
  fs.mkdirSync(output,{recursive:true});
  for(const theme of ['dark','light'])for(const mobile of [false,true]) {
   await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(350);
   check(`${theme} ${mobile?'mobile':'desktop'} fits viewport`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(output,`${theme}-${mobile?'mobile':'desktop'}.png`),fullPage:true});
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.text-link').focus();await page.keyboard.press('Tab');check('keyboard focus available',await page.evaluate(()=>document.activeElement!==document.body));
  denied=true;await page.locator('#refresh').click();await page.locator('#review-panel').waitFor({state:'hidden'});
  check('revocation clears private records',await page.locator('#queue button').count()===0&&await page.locator('#preview img').count()===0&&await page.locator('#metadata dd').count()===0);
  check('no browser errors',errors.length===0);console.log(`${checks} moderation browser checks passed (mock Auth and API)`);
 } finally {await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
