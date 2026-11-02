/* Opt-in, LOCAL ONLY. Disposable Auth users; no real credentials printed or saved.
   Requires aoms-local, community-review and local form server. Refuses an occupied allowlist. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const {createClient}=require('../tooling/node_modules/@supabase/supabase-js');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const local=path.resolve(__dirname,'../../../work/aoms-local');
const URL='http://localhost:54321',origin='http://localhost:8766',endpoint=URL+'/functions/v1/community-review';
const sql=query=>execFileSync('docker',['exec','supabase_db_aoms-local','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-tAc',query],{encoding:'utf8'}).trim();
const uuid=id=>{assert.match(id,/^[0-9a-f-]{36}$/);return id;};
function totp(secret){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.replace(/=+$/,'').toUpperCase())bits+=chars.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g).map(b=>parseInt(b,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const mac=crypto.createHmac('sha1',key).update(counter).digest();const offset=mac[19]&15;return ((mac.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');}
const waitNextCode=()=>new Promise(r=>setTimeout(r,31000-Date.now()%30000));
(async()=>{
 if(process.env.AOMS_LOCAL_AUTH_TEST!=='1')throw Error('Set AOMS_LOCAL_AUTH_TEST=1 for disposable local Auth integration tests');
 const keys=JSON.parse(fs.readFileSync(path.join(local,'status.json'),'utf8').replace(/^\uFEFF/,''));
 assert.ok(['http://127.0.0.1:54321','http://localhost:54321'].includes(keys.API_URL),'Refuse nonlocal credentials');
 assert.equal(sql('select count(*) from public.submission_moderators'),'0','Refuse replacing an enrolled moderator');
 const before=sql("select (select count(*) from public.media_submissions)||'|'||(select count(*) from storage.objects where bucket_id='aoms-submissions')||'|'||(select intake_enabled from public.submission_settings)");
 const admin=createClient(URL,keys.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const clients=[],users=[];let browser,checks=0,stage='setup';
 const check=(name,value)=>{assert.ok(value,name);checks++;console.log('PASS '+name);};
 const request=async(token,body={action:'session'})=>fetch(endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
 async function newUser(){const email='aoms-test-'+crypto.randomUUID()+'@example.invalid',password=crypto.randomBytes(24).toString('base64url');const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});if(error)throw Error('Disposable user creation failed: '+error.code);users.push(uuid(data.user.id));return{email,password,id:data.user.id};}
 try {
  const user=await newUser();sql(`insert into public.submission_moderators(user_id) values ('${user.id}')`);
  check('anonymous request rejected',(await request(null)).status===401);
  browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
  const page=await browser.newPage();page.on('response',async r=>{if(r.url().includes('/auth/v1/token')&&r.status()!==200){try{const data=await r.json();console.log('Auth diagnostic status/code:',r.status(),data.code||data.error_code||data.error||'unknown');}catch{}}});stage='browser login';
  await page.goto(origin+'/tools/submission-review.html');await page.locator('#email').fill(user.email);await page.locator('#password').fill('WrongPasswordForLocalTest');const wrongPasswordResponse=page.waitForResponse(r=>r.url().includes('/auth/v1/token'));await page.getByRole('button',{name:'Sign in',exact:true}).click();const badPassword=await(await wrongPasswordResponse).json();await page.getByText('Unable to complete that request. Please try again.').waitFor();check('wrong password rejected',(badPassword.error_code||badPassword.code)==='invalid_credentials'&&await page.locator('#review-panel').isHidden());
  await page.locator('#password').fill(user.password);
  const loginResponse=page.waitForResponse(r=>r.url().includes('/auth/v1/token'));
  await page.getByRole('button',{name:'Sign in',exact:true}).click();const loginResult=await loginResponse;assert.equal(loginResult.status(),200,'Valid password must be accepted by Auth');const login=await loginResult.json();
  await page.locator('#enroll').waitFor({state:'visible'});check('email/password login succeeds',!!login.access_token);
  check('password-only token rejected',(await request(login.access_token)).status===403);
  stage='MFA enrollment';const enrollResponse=page.waitForResponse(r=>r.url().endsWith('/auth/v1/factors')&&r.request().method()==='POST'&&r.status()===200);
  await page.locator('#enroll').click();const factor=await(await enrollResponse).json();
  await page.waitForFunction(()=>document.querySelector('#qr').naturalWidth>0);check('real enrollment QR renders',await page.locator('#qr').isVisible());
  const wrongCode=totp(factor.totp.secret)==='000000'?'000001':'000000';await page.locator('#code').fill(wrongCode);await page.getByRole('button',{name:'Verify',exact:true}).click();await page.getByText('Unable to complete that request. Please try again.').waitFor();check('incorrect authenticator code rejected',await page.locator('#review-panel').isHidden());
  const verifyResponse=page.waitForResponse(r=>r.url().includes('/verify')&&r.status()===200);
  await page.locator('#code').fill(totp(factor.totp.secret));await page.getByRole('button',{name:'Verify',exact:true}).click();const verified=await(await verifyResponse).json();
  await page.locator('#review-panel').waitFor({state:'visible'});await page.getByText('Private queue loaded.').waitFor();const token=verified.access_token;
  check('MFA moderator opens real queue',(await request(token)).status===200);
  check('QR removed after verification',await page.locator('#qr-panel').isHidden());
  check('no Auth token persisted',await page.evaluate(()=>!Object.keys(localStorage).some(k=>k.includes('auth-token'))));
  stage='authorization boundaries';
  check('forged signature rejected',(await request(token.slice(0,-8)+'AAAAAAAA')).status===401);
  const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
  const sign=payload=>{const input=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(payload)).toString('base64url');return input+'.'+crypto.createHmac('sha256',keys.JWT_SECRET).update(input).digest('base64url');};
  check('local JWT expiry fixture has a valid signature',(await request(sign({...claims,exp:Math.floor(Date.now()/1000)+60}))).status===200);
  check('expired access token rejected',(await request(sign({...claims,exp:Math.floor(Date.now()/1000)-60}))).status===401);
  sql(`update public.submission_moderators set active=false where user_id='${user.id}'`);check('allowlist deactivation immediately rejects',(await request(token)).status===403);sql(`update public.submission_moderators set active=true where user_id='${user.id}'`);
  check('browser role cannot read rows',(await fetch(URL+'/rest/v1/media_submissions?select=id',{headers:{apikey:keys.PUBLISHABLE_KEY,Authorization:'Bearer '+token}})).status>=400);
  const outsider=await newUser(),client=createClient(URL,keys.PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(client);
  const signIn=await client.auth.signInWithPassword({email:outsider.email,password:outsider.password});assert.equal(signIn.error,null);
  const enrolled=await client.auth.mfa.enroll({factorType:'totp'});assert.equal(enrolled.error,null);
  const outsiderVerified=await client.auth.mfa.challengeAndVerify({factorId:enrolled.data.id,code:totp(enrolled.data.totp.secret)});assert.equal(outsiderVerified.error,null);
  check('real MFA account outside allowlist rejected',(await request(outsiderVerified.data.access_token)).status===403);
  stage='logout';await page.locator('#sign-out').click();await page.getByText('Signed out.',{exact:true}).waitFor();check('logout clears private view',await page.locator('#review-panel').isHidden());check('logged-out JWT immediately rejected',(await request(token)).status>=400);
  stage='returning MFA login';await waitNextCode();await page.locator('#password').fill(user.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('#mfa-form').waitFor({state:'visible'});check('returning account uses existing authenticator',await page.locator('#enroll').isHidden());
  const returnResponse=page.waitForResponse(r=>r.url().includes('/verify')&&r.status()===200);await page.locator('#code').fill(totp(factor.totp.secret));await page.getByRole('button',{name:'Verify',exact:true}).click();const returned=await(await returnResponse).json();await page.getByText('Private queue loaded.').waitFor();
  const sid=uuid(JSON.parse(Buffer.from(returned.access_token.split('.')[1],'base64url')).session_id);
  sql(`update auth.sessions set not_after=now()-interval '1 second' where id='${sid}' and user_id='${user.id}'`);
  check('expired database session rejected',(await request(returned.access_token)).status>=400);await page.locator('#refresh').click();await page.locator('#review-panel').waitFor({state:'hidden'});check('expired session clears browser data',await page.locator('#queue button').count()===0);
  check('self-signup disabled',(await client.auth.signUp({email:'blocked-'+crypto.randomUUID()+'@example.invalid',password:crypto.randomBytes(24).toString('base64url')})).error?.code==='signup_disabled');
  console.log(`${checks} real local Auth/browser checks passed`);
 } catch(e) {console.error('FAILED phase: '+stage);throw new Error(e instanceof assert.AssertionError?e.message.split('\n')[0]:e.name+': '+(e.code||'integration check failed'));}
 finally {
  await browser?.close();for(const c of clients)await c.auth.signOut({scope:'local'}).catch(()=>{});
  for(const id of users){sql(`delete from public.submission_moderators where user_id='${id}'`);const {error}=await admin.auth.admin.deleteUser(id);if(error)throw Error('Disposable account cleanup failed');}
  assert.equal(sql("select (select count(*) from public.media_submissions)||'|'||(select count(*) from storage.objects where bucket_id='aoms-submissions')||'|'||(select intake_enabled from public.submission_settings)"),before,'Existing inbox, objects and intake preserved');
  console.log('PASS disposable Auth accounts removed; original local inbox/storage/intake unchanged');
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
