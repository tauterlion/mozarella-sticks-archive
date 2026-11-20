-- Run only on the authorized aoms-local test stack with intake enabled.
-- All fixture rows and the temporary audit sequence restart roll back.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ declare n bigint; begin
 select last_value into n from public.submission_audit_id_seq;
 execute format('alter sequence public.submission_audit_id_seq restart with %s',n+1);
end $$;

do $$
declare
 capability text := repeat(md5(gen_random_uuid()::text),2);
 captcha text := repeat(md5(gen_random_uuid()::text),2);
 client_file uuid := gen_random_uuid();
 b jsonb; a jsonb; claim jsonb; settled jsonb; recovered jsonb;
begin
 perform set_config('role','service_role',true);
 b := public.submission_intake('batch',jsonb_build_object('capabilityHash',capability,'captchaHash',captcha));
 if not (b ? 'receipt') then raise exception 'Could not reserve local test batch'; end if;
 a := public.submission_intake('authorize',jsonb_build_object('capabilityHash',capability,'clientFileId',client_file,
  'filename','expiry-test.png','mime','image/png','size',100,'caption','Rollback-only expiry fixture',
  'eventId','halloween-sleepovers-2026','people',jsonb_build_array(),'noPeople',true,'consent',true));
 if not (a ? 'id') then raise exception 'Could not reserve local test file: %',a->>'error'; end if;
 claim := public.submission_intake('claim',jsonb_build_object('capabilityHash',capability,'id',a->>'id'));
 settled := public.submission_intake('finish',jsonb_build_object('capabilityHash',capability,'id',a->>'id',
  'lease',claim->>'lease','sha256',repeat('c',64),'mime','image/png','size',100));
 if settled->>'status' is distinct from 'pending' then raise exception 'Test finalization failed'; end if;
 perform set_config('role','none',true);
 update public.submission_batches set created_at=now()-interval '3 hours', expires_at=now()-interval '1 hour',
  captcha_verified_at=now()-interval '3 hours' where capability_sha256=capability;
 perform set_config('role','service_role',true);
 recovered := public.submission_expired_outcome(capability,client_file);
 if recovered <> jsonb_build_object('status','received','receipt',b->>'receipt') then raise exception 'Recovery omitted the existing receipt'; end if;
 if public.submission_intake('claim',jsonb_build_object('capabilityHash',capability,'id',a->>'id'))->>'error' is distinct from 'batch_expired'
  then raise exception 'Expired batch still permits finalization'; end if;
 if public.submission_expired_outcome(capability,gen_random_uuid())->>'status' is distinct from 'retry'
  then raise exception 'Untouched file should be retryable'; end if;
 raise notice 'PASS real PostgreSQL recovery preserves the receipt, fences expired writes, and identifies untouched files';
end $$;
rollback;
