-- Leased retention claims keep the worker restartable without deleting audit rows.
alter table public.media_submissions
  add column storage_purge_lease uuid,
  add column storage_purge_lease_until timestamptz,
  add constraint submission_purge_lease_pair check ((storage_purge_lease is null) = (storage_purge_lease_until is null));

-- Freeze out the earlier unleased cleanup branches. Other submission writes do
-- not touch these columns. DELETE is always performed through the Storage API.
create function aoms_private.require_cleanup_lease() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.storage_purge_lease is not distinct from old.storage_purge_lease then
   raise exception 'Use the leased retention worker' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function aoms_private.require_cleanup_lease() from public,anon,authenticated;
grant execute on function aoms_private.require_cleanup_lease() to service_role;
create trigger require_cleanup_lease before update of storage_purge_started_at,storage_purged_at
on public.media_submissions for each row execute function aoms_private.require_cleanup_lease();

create function public.submission_retention(action text, payload jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare settings public.submission_settings; result jsonb; at_time timestamptz;
  lease_id uuid; item_id uuid; expired_batches int; expired_rates int; affected int;
begin
 if action is null or action not in ('report','claim','complete') then return jsonb_build_object('error','invalid_request'); end if;
 if action <> 'report' then perform pg_catalog.pg_advisory_xact_lock(74121,1); end if;
 at_time := clock_timestamp();
 select * into strict settings from public.submission_settings where singleton;
 if action='report' then
  return (select jsonb_build_object('reservedBytes',coalesce(sum(reserved_bytes) filter(where storage_purged_at is null),0),
   'budgetBytes',settings.reserved_byte_budget,
   'awaitingCleanup',count(*) filter(where storage_purge_started_at is not null and storage_purged_at is null),
   'stalledCleanup',count(*) filter(where storage_purge_started_at is not null and storage_purged_at is null
     and (storage_purge_lease_until is null or storage_purge_lease_until<=at_time)),
   'oldestUnconfirmedSeconds',coalesce(extract(epoch from at_time-min(storage_purge_started_at) filter(where storage_purged_at is null)),0),
   'expiredBatches',(select count(*) from public.submission_batches where status='open' and expires_at<=at_time),
   'expiredRateWindows',(select count(*) from public.submission_rate_limits where expires_at<=at_time))
  from public.media_submissions);
 elsif action='claim' then
  with expired as (select id from public.submission_batches where status='open' and expires_at<=at_time order by expires_at,id limit 200)
  update public.submission_batches b set status='expired' from expired e where b.id=e.id;
  get diagnostics expired_batches=row_count;
  with expired as (select scope,subject_hmac,window_start from public.submission_rate_limits where expires_at<=at_time order by expires_at limit 500)
  delete from public.submission_rate_limits r using expired e where (r.scope,r.subject_hmac,r.window_start)=(e.scope,e.subject_hmac,e.window_start);
  get diagnostics expired_rates=row_count;
  lease_id:=gen_random_uuid();
  with eligible as (
   select m.id from public.media_submissions m join public.submission_batches b on b.id=m.batch_id
   where m.storage_purged_at is null and (m.storage_purge_lease_until is null or m.storage_purge_lease_until<=at_time)
   and m.storage_path='incoming/'||b.id||'/'||m.id and b.expires_at+interval '26 hours'<at_time
   and ((m.status in ('uploading','failed') and m.created_at+settings.abandoned_retention<at_time)
     or (m.status='rejected' and m.reviewed_at+settings.rejected_retention<at_time))
   order by m.created_at,m.id limit 10 for update of m skip locked
  ), claimed as (
   update public.media_submissions m set storage_purge_started_at=coalesce(m.storage_purge_started_at,at_time),
     storage_purge_lease=lease_id,storage_purge_lease_until=at_time+interval '10 minutes'
   from eligible e where m.id=e.id returning m.id,m.batch_id,m.storage_path
  ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'batchId',batch_id,'path',storage_path)),'[]') into result from claimed;
  return jsonb_build_object('lease',lease_id,'items',result,'expiredBatches',expired_batches,'expiredRateWindows',expired_rates);
 end if;
 lease_id:=(payload->>'lease')::uuid;
 item_id:=(payload->>'id')::uuid;
 update public.media_submissions m set storage_purged_at=at_time,storage_purge_lease=null,storage_purge_lease_until=null,
   status=case when m.status='uploading' then 'failed' else m.status end
 where m.id=item_id and m.storage_purged_at is null and m.storage_purge_lease=lease_id and m.storage_purge_lease_until>at_time
 and not exists(select 1 from storage.objects o where o.bucket_id='aoms-submissions' and o.name=m.storage_path);
 get diagnostics affected=row_count;
 return jsonb_build_object('released',affected=1);
end $$;
revoke all on function public.submission_retention(text,jsonb) from public,anon,authenticated;
grant execute on function public.submission_retention(text,jsonb) to service_role;
