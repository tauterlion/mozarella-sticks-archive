const {PGlite}=require('../tooling/node_modules/@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path');
(async()=>{const db=new PGlite();try{
 await db.exec(fs.readFileSync(path.join(__dirname,'audited-baseline.sql'),'utf8'));
 for(const name of fs.readdirSync(path.join(__dirname,'../migrations')).filter(n=>n.endsWith('.sql')).sort())await db.exec(fs.readFileSync(path.join(__dirname,'../migrations',name),'utf8'));
 const beforeSequence=await db.query('select last_value,is_called from public.submission_audit_id_seq');
 const results=await db.exec(fs.readFileSync(path.join(__dirname,'security.sql'),'utf8'));
 for(const result of results)if(result.rows?.[0]?.passed)console.log(JSON.stringify(result.rows[0],null,2));
 const afterSequence=await db.query('select last_value,is_called from public.submission_audit_id_seq');
 if(JSON.stringify(beforeSequence.rows)!==JSON.stringify(afterSequence.rows))throw Error('Sequence state was not rolled back');
 console.log('PASS: audit sequence unchanged after rollback');
 const state=await db.query('select intake_enabled,(select count(*) from public.media_submissions) as submissions,(select count(*) from public.submission_moderators) as moderators from public.submission_settings');
 if(state.rows[0].intake_enabled||Number(state.rows[0].submissions)||Number(state.rows[0].moderators))throw Error('Tests did not roll back cleanly');
 console.log('PASS: test transaction rolled back; intake disabled; inbox and allowlist empty');
}finally{await db.close();}})().catch(e=>{console.error(e.message);process.exit(1)});
