const {PGlite}=require('../tooling/node_modules/@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite(); let checks=0;
 const check=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);checks++;console.log('PASS '+name);};
 const actor='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
 const read=async(action='session',payload={},who=actor,sid=session)=>(await db.query('select public.submission_review_read($1,$2,$3,$4::jsonb) result',[who,sid,action,JSON.stringify(payload)])).rows[0].result;
 try {
  await db.exec(fs.readFileSync(path.join(__dirname,'audited-baseline.sql'),'utf8'));
  for(const f of fs.readdirSync(path.join(__dirname,'../migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync(path.join(__dirname,'../migrations',f),'utf8'));
  await db.exec('begin');
  for(const role of ['anon','authenticated']) {
   await db.exec('savepoint denied; set role '+role); await assert.rejects(read(),/permission denied/); await db.exec('rollback to denied'); checks++;
  }
  await db.exec(`insert into auth.users values ('${actor}'),('${other}'); insert into auth.sessions(id,user_id,aal) values ('${session}','${actor}','aal2'); set role service_role`);
  check('account without operator enrollment denied',(await read()).error,'forbidden');
  await db.exec(`reset role; insert into public.submission_moderators(user_id) values ('${actor}'); set role service_role`);
  check('enrolled MFA moderator accepted',(await read()).ok,true);
  check('another user cannot borrow moderator session',(await read('session',{},other)).error,'forbidden');
  check('unknown session denied',(await read('session',{},actor,other)).error,'forbidden');
  check('empty queue has bounded shape',await read('list',{status:'pending',page:0}),{items:[],page:0,total:0,pendingCount:0});
  check('unknown record not exposed',(await read('detail',{id:other})).error,'not_found');
  check('approval not implemented in read RPC',(await read('approve',{id:other})).error,'invalid_request');
  await db.exec("reset role; update public.submission_settings set intake_enabled=true; set role service_role");
  const intake=async(action,payload)=>(await db.query('select public.submission_intake($1,$2::jsonb) result',[action,JSON.stringify(payload)])).rows[0].result;
  const hash='a'.repeat(64);
  await intake('batch',{capabilityHash:hash,captchaHash:'b'.repeat(64),captchaVerifiedAt:new Date().toISOString()});
  const upload=await intake('authorize',{capabilityHash:hash,clientFileId:other,filename:'private.png',mime:'image/png',size:100,caption:'<script>private</script>',eventId:'closeup-departure',people:['alejandro'],noPeople:false,proposedTitle:null,proposedDate:null,proposedDetails:null,consent:true});
  check('unfinalized upload unavailable',(await read('detail',{id:upload.id})).error,'not_found');
  const lease=await intake('claim',{capabilityHash:hash,id:upload.id});
  await intake('finish',{capabilityHash:hash,id:upload.id,lease:lease.lease,sha256:'c'.repeat(64),mime:'image/png',size:100});
  await db.exec('reset role; update public.submission_settings set intake_enabled=false; set role service_role');
  const listed=await read('list',{status:'pending',page:0});
  check('moderation works while intake off',listed.items.length,1);
  check('queue omits original storage path',Object.hasOwn(listed.items[0],'storage_path'),false);
  check('detail preserves literal caption',(await read('detail',{id:upload.id})).item.caption,'<script>private</script>');
  check('preview path only returned to trusted gateway',(await read('preview',{id:upload.id})).path,upload.path);
  check('pagination bounded', (await read('list',{status:'pending',page:1})).items.length,0);
  await db.exec(`update public.media_submissions set storage_purge_started_at=now() where id='${upload.id}'`);
  check('purging object cannot get preview',(await read('preview',{id:upload.id})).error,'not_found');
  await db.exec("reset role; update auth.sessions set aal='aal1'; set role service_role");
  check('database also requires MFA',(await read()).error,'forbidden');
  await db.exec("reset role; update auth.sessions set aal='aal2',not_after=now()-interval '1 second'; set role service_role");
  check('expired session denied',(await read()).error,'forbidden');
  await db.exec('reset role; update auth.sessions set not_after=null; update public.submission_moderators set active=false; set role service_role');
  check('deactivated moderator denied immediately',(await read()).error,'forbidden');
  await db.exec('reset role; update public.submission_moderators set active=true; delete from auth.sessions; set role service_role');
  check('signed-out session denied before JWT expiry',(await read()).error,'forbidden');
  await db.exec('reset role; rollback');
  check('fixtures rolled back',Number((await db.query('select count(*) n from auth.users')).rows[0].n),0);
  check('intake stays disabled',(await db.query('select intake_enabled from public.submission_settings')).rows[0].intake_enabled,false);
  console.log(`${checks} moderation database checks passed`);
 } finally { await db.close(); }
})().catch(e=>{console.error(e.message);process.exit(1);});
