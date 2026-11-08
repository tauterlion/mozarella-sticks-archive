-- Runs on local PostgreSQL or audited hosted project; all test rows/users are rolled back.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';
do $$ begin if (select intake_enabled from public.submission_settings where singleton) is distinct from false or exists(select 1 from public.submission_audit) or exists(select 1 from public.media_removal_requests) or exists(select 1 from public.media_submissions) or exists(select 1 from public.submission_batches) or exists(select 1 from public.submission_moderators) then raise exception 'Run destructive-fixture tests only against an empty, disabled intake project'; end if; end $$;
-- RESTART is transactional: rollback restores the original sequence state too.
-- Plain nextval calls alone would leave gaps despite rolling back test rows.
alter sequence public.submission_audit_id_seq restart with 1;
create temporary table security_test_results (test text not null);
grant select,insert on security_test_results to anon,authenticated,service_role;
create function pg_temp.expect_error(statement text, expected text, label text) returns void
language plpgsql security invoker as $$
begin
 begin
  execute statement;
 exception when others then
  if sqlstate=expected then insert into pg_temp.security_test_results values(label); return; end if;
  raise exception 'Unexpected error for %: % %',label,sqlstate,sqlerrm;
 end;
 raise exception 'Expected denial for %',label;
end $$;

-- Explicit table reads and writes fail for both browser roles, even with known IDs.
set local role anon;
select pg_temp.expect_error('select * from public.media_submissions','42501','anon cannot read submissions');
select pg_temp.expect_error('insert into public.media_submissions default values','42501','anon cannot insert');
select pg_temp.expect_error('update public.media_submissions set status=''approved''','42501','anon cannot approve');
select pg_temp.expect_error('delete from public.media_submissions','42501','anon cannot delete');
select pg_temp.expect_error('select * from public.submission_moderators','42501','anon cannot enumerate moderator');
select pg_temp.expect_error('select * from public.submission_batches','42501','anon cannot read upload capabilities');
select pg_temp.expect_error('select * from public.submission_rate_limits','42501','anon cannot read abuse signals');
select pg_temp.expect_error('select * from public.submission_audit','42501','anon cannot read audit');
select pg_temp.expect_error('select * from public.media_removal_requests','42501','anon cannot read reports');
select pg_temp.expect_error('select aoms_private.guard_submission()','42501','anon cannot invoke trigger helpers');
reset role;
set local role authenticated;
select pg_temp.expect_error('select * from public.media_submissions','42501','ordinary authenticated user cannot read');
select pg_temp.expect_error('update public.media_submissions set status=''published''','42501','ordinary authenticated user cannot publish');
select pg_temp.expect_error('insert into public.submission_moderators default values','42501','authenticated user cannot self-enroll');
reset role;
set local role service_role;
select pg_temp.expect_error('update public.submission_settings set intake_enabled=true','42501','backend cannot enable release switch');
select pg_temp.expect_error('insert into public.submission_moderators default values','42501','backend cannot enroll moderator');
select pg_temp.expect_error('delete from public.submission_audit','42501','backend cannot erase audit');
reset role;

-- Fixtures use generated UUIDs and canonical IDs already in the audited validation cache.
create temp table fixture as select gen_random_uuid() batch,gen_random_uuid() item,gen_random_uuid() moderator,
 (select id from public.submission_canonical_events order by id limit 1) event,
 (select id from public.submission_canonical_people order by id limit 1) person;
insert into public.submission_batches(id,capability_sha256,captcha_verified_at,captcha_token_sha256)
 select batch,repeat('1',64),now(),repeat('2',64) from fixture;
create temp table valid_submission as select item id,batch batch_id,gen_random_uuid() client_file_id,
 'A memory'::text caption,event event_id,array[person] people_ids,'memory.jpg'::text original_filename,
 'incoming/'||batch::text||'/'||item::text storage_path,'image/jpeg'::text mime_type,52428800::bigint file_size,
 true consent_confirmed,now() consent_confirmed_at from fixture;
select pg_temp.expect_error('insert into public.media_submissions(id,batch_id,client_file_id,caption,event_id,people_ids,original_filename,storage_path,mime_type,file_size,consent_confirmed,consent_confirmed_at) select * from valid_submission','23514','intake fails closed');
update public.submission_settings set intake_enabled=true where singleton;
insert into public.media_submissions(id,batch_id,client_file_id,caption,event_id,people_ids,original_filename,storage_path,mime_type,file_size,consent_confirmed,consent_confirmed_at) select * from valid_submission;
insert into security_test_results values('exact 50 MiB accepted in uploading state');
select pg_temp.expect_error('update public.media_submissions set display_name=''Contributor''','23514','anonymous-only contract');
select pg_temp.expect_error('update public.media_submissions set caption=''   ''','23514','blank caption rejected');
select pg_temp.expect_error('update public.media_submissions set caption=repeat(''x'',501)','23514','oversize caption rejected');
select pg_temp.expect_error('update public.media_submissions set event_id=''not-a-canonical-event''','23503','unknown event rejected');
select pg_temp.expect_error('update public.media_submissions set people_ids=array[''not-a-person'']','23514','unknown person rejected');
select pg_temp.expect_error('update public.media_submissions set people_ids=people_ids||people_ids','23514','duplicate person tags rejected');
select pg_temp.expect_error('update public.media_submissions set people_ids=array[null]::text[]','23514','null person tags rejected');
select pg_temp.expect_error('update public.media_submissions set people_ids=''{}''','23514','empty tags need explicit no-people choice');
select pg_temp.expect_error('update public.media_submissions set storage_path=''../public/evil.jpg''','23514','path tampering rejected');
update valid_submission set file_size=52428801;
select pg_temp.expect_error('insert into public.media_submissions(id,batch_id,client_file_id,caption,event_id,people_ids,original_filename,storage_path,mime_type,file_size,consent_confirmed,consent_confirmed_at) select * from valid_submission','23514','50 MiB plus one rejected');
update valid_submission set file_size=52428800;
update valid_submission set mime_type='image/svg+xml';
select pg_temp.expect_error('insert into public.media_submissions(id,batch_id,client_file_id,caption,event_id,people_ids,original_filename,storage_path,mime_type,file_size,consent_confirmed,consent_confirmed_at) select * from valid_submission','23514','unsupported MIME rejected');
update valid_submission set mime_type='image/jpeg';
select pg_temp.expect_error('update public.media_submissions set consent_confirmed=false','23514','consent required');
select pg_temp.expect_error('update public.media_submissions set status=''pending''','23514','unverified finalization rejected');
select pg_temp.expect_error('update public.media_submissions set status=''published''','23514','cannot skip approval and publishing');
select pg_temp.expect_error('update public.media_submissions set proposed_event_title=''A proposal'',proposed_event_details=''Details''','23514','existing event and proposal mutually exclusive');
update public.media_submissions set event_id=null,proposed_event_title='New memory',proposed_event_details='Needs editorial review',people_ids='{}',no_people_to_tag=true;
insert into security_test_results values('anonymous proposal and explicit no-people choice accepted');
select pg_temp.expect_error('update public.media_submissions set proposed_event_details=null','23514','proposal details required');
update public.submission_batches set status='expired';
select pg_temp.expect_error('update public.media_submissions set status=''pending'',file_sha256=repeat(''a'',64),verified_mime_type=''image/jpeg'',verified_file_size=52428800,finalized_at=now()','23514','expired upload cannot finalize');
update public.submission_batches set status='open';
select pg_temp.expect_error('update public.media_submissions set status=''pending'',file_sha256=repeat(''a'',64),verified_mime_type=''image/png'',verified_file_size=52428800,finalized_at=now()','23514','verified MIME mismatch rejected');
update public.media_submissions set status='pending',file_sha256=repeat('a',64),verified_mime_type='image/jpeg',verified_file_size=52428800,finalized_at=now();
select pg_temp.expect_error('update public.media_submissions set status=''approved'',reviewed_at=now()','23514','empty moderator allowlist blocks approval');
insert into auth.users(id) select moderator from fixture;
insert into public.submission_moderators(user_id) select moderator from fixture;
select pg_temp.expect_error('update public.media_submissions set status=''approved'',reviewed_by=(select moderator from fixture),reviewed_at=now()','23514','proposal must map to canonical event before approval');
update public.media_submissions set event_id=(select event from fixture),proposed_event_title=null,proposed_event_details=null,status='approved',reviewed_by=(select moderator from fixture),reviewed_at=now();
select pg_temp.expect_error('update public.media_submissions set file_sha256=repeat(''b'',64)','23514','verified original hash immutable');
update public.media_submissions set status='publishing';
select pg_temp.expect_error('update public.media_submissions set status=''published''','23514','publishing requires confirmed mapping');
update public.media_submissions set status='published',published_at=now(),github_pr_url='https://github.com/tauterlion/mozarella-sticks-archive/pull/1',github_commit_sha=repeat('a',40),public_media_id='test-only',public_asset_path='assets/media/test-only.jpg';
select pg_temp.expect_error('update public.media_submissions set caption=''Changed outside publishing''','23514','published metadata cannot drift');
select pg_temp.expect_error('update public.media_submissions set status=''removed'',removed_at=now()','23514','unverified removal rejected');
insert into public.media_removal_requests(public_media_id,reason,status,verified_by,verified_at) select 'test-only','Test fixture only','verified',moderator,now() from fixture;
update public.media_submissions set status='removed',removed_at=now();
insert into security_test_results values('full reviewed state progression and verified removal accepted');
do $$ begin
 if (select count(*) from public.submission_audit where submission_id=(select item from fixture)) < 6 then raise exception 'Audit trail missing'; end if;
 if (select version from public.media_submissions where id=(select item from fixture)) < 6 then raise exception 'Record version not advanced'; end if;
end $$;
insert into security_test_results values('audit trail and monotonically increasing record versions');
select count(*) as passed, jsonb_agg(test order by test) as checks from security_test_results;
rollback;
