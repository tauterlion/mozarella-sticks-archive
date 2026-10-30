-- Service-only intake operations; no browser table/storage policy is introduced.
alter table public.media_submissions
  add column reserved_bytes bigint not null default 52428800 check (reserved_bytes = 52428800),
  add column storage_purged_at timestamptz,
  add column storage_purge_started_at timestamptz,
  add column verification_lease uuid,
  add column verification_expires_at timestamptz;
create index submission_reservations_idx on public.media_submissions(storage_purged_at) where storage_purged_at is null;

-- Claim deletion before contacting Storage so a later moderator retry cannot
-- restore a rejected object while a cleanup worker is deleting it.
create function aoms_private.guard_submission_purge() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.storage_purge_started_at is not null and
    (new.storage_purge_started_at is distinct from old.storage_purge_started_at
      or (new.status is distinct from old.status and new.status <> 'failed')) then
    raise exception 'Purging uploads cannot be restored' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function aoms_private.guard_submission_purge() from public,anon,authenticated;
grant execute on function aoms_private.guard_submission_purge() to service_role;
create trigger guard_submission_purge before update on public.media_submissions
  for each row execute function aoms_private.guard_submission_purge();

-- Global limits deliberately do not trust X-Forwarded-For or collect visitor IPs.
-- Returning a denial (rather than raising) commits the rate counter.
create function public.submission_intake(action text, payload jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  settings public.submission_settings;
  batch public.submission_batches;
  item public.media_submissions;
  minute_start timestamptz := date_trunc('minute',now());
  counter bigint;
  new_id uuid;
  lease uuid;
  result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(74121,1);
  select * into strict settings from public.submission_settings where singleton;
  if action = 'cleanup_candidates' then
    delete from public.submission_rate_limits where expires_at < now();
    with candidates as (select m.id from public.media_submissions m join public.submission_batches b on b.id=m.batch_id
        where m.storage_purged_at is null and b.expires_at + interval '26 hours' < now()
        and ((m.status in ('uploading','failed') and m.created_at + settings.abandoned_retention < now())
          or (m.status='rejected' and m.reviewed_at + settings.rejected_retention < now()))
        order by m.created_at limit 50), claimed as (
      update public.media_submissions m set storage_purge_started_at=coalesce(m.storage_purge_started_at,now())
      from candidates c where m.id=c.id returning m.id,m.storage_path
    ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'path',storage_path)),'[]') into result from claimed;
    return jsonb_build_object('items',result);
  elsif action = 'cleanup_done' then
    -- Caller confirms Storage API deletion first. Never edit storage.objects directly.
    update public.media_submissions m set storage_purged_at=now(),
      status=case when m.status='uploading' then 'failed' else m.status end
      from public.submission_batches b where m.id=(payload->>'id')::uuid and b.id=m.batch_id
      and m.storage_purged_at is null and m.storage_purge_started_at is not null and b.expires_at + interval '26 hours' < now()
      and ((m.status in ('uploading','failed') and m.created_at+settings.abandoned_retention < now())
        or (m.status='rejected' and m.reviewed_at+settings.rejected_retention < now()));
    delete from public.submission_rate_limits where expires_at < now();
    return jsonb_build_object('ok',true);
  end if;
  if not settings.intake_enabled then return '{"error":"intake_disabled"}'; end if;
  if action = 'tick' then
    insert into public.submission_rate_limits(scope,subject_hmac,window_start,expires_at,request_count)
    values ('global',repeat('0',64),minute_start,minute_start+interval '1 hour',1)
    on conflict (scope,subject_hmac,window_start) do update
      set request_count=least(public.submission_rate_limits.request_count+1,1000000)
    returning request_count into counter;
    if counter>60 then return '{"error":"rate_limited"}'; end if;
    return '{"ok":true}';
  end if;
  if action = 'batch' then
    select * into batch from public.submission_batches where capability_sha256=payload->>'capabilityHash';
    if found then
      if batch.status<>'open' or batch.expires_at<=now() then return '{"error":"batch_expired"}'; end if;
      return jsonb_build_object('receipt',batch.receipt_id,'expiresAt',batch.expires_at);
    end if;
    if (select count(*) from public.submission_batches where created_at>now()-interval '1 hour')>=10 then
      return '{"error":"rate_limited"}';
    end if;
    insert into public.submission_batches(capability_sha256,captcha_verified_at,captcha_token_sha256)
      values(payload->>'capabilityHash',now(),payload->>'captchaHash') returning * into batch;
    return jsonb_build_object('receipt',batch.receipt_id,'expiresAt',batch.expires_at);
  end if;
  select * into batch from public.submission_batches where capability_sha256=payload->>'capabilityHash'
    and status='open' and expires_at>now();
  if not found then return '{"error":"batch_expired"}'; end if;
  if action='resume' then return jsonb_build_object('receipt',batch.receipt_id,'expiresAt',batch.expires_at); end if;
  if action='authorize' then
    select * into item from public.media_submissions where batch_id=batch.id and client_file_id=(payload->>'clientFileId')::uuid;
    if found then
      -- Retry keeps the first validated metadata; the browser locks it after authorization.
      if item.status='pending' then return jsonb_build_object('status','pending','receipt',batch.receipt_id); end if;
      if item.status<>'uploading' then return '{"error":"upload_unavailable"}'; end if;
      return jsonb_build_object('id',item.id,'path',item.storage_path,'mime',item.mime_type,'status',item.status);
    end if;
    if (select count(*) from public.media_submissions where batch_id=batch.id and status='uploading')>=settings.max_inflight_per_batch then
      return '{"error":"busy"}';
    end if;
    -- Reserve the bucket maximum, not the untrusted claimed size, for every signed capability.
    if (select coalesce(sum(reserved_bytes),0) from public.media_submissions where storage_purged_at is null)+52428800>settings.reserved_byte_budget then
      return '{"error":"quota_exhausted"}';
    end if;
    new_id := gen_random_uuid();
    insert into public.media_submissions(id,batch_id,client_file_id,caption,event_id,people_ids,original_filename,storage_path,
      mime_type,file_size,consent_confirmed,consent_confirmed_at,proposed_event_title,proposed_event_date,proposed_event_details,no_people_to_tag)
    values (new_id,batch.id,(payload->>'clientFileId')::uuid,payload->>'caption',payload->>'eventId',
      array(select jsonb_array_elements_text(payload->'people')),payload->>'filename','incoming/'||batch.id||'/'||new_id,
      payload->>'mime',(payload->>'size')::bigint,(payload->>'consent')::boolean,now(),payload->>'proposedTitle',
      (payload->>'proposedDate')::date,payload->>'proposedDetails',(payload->>'noPeople')::boolean) returning * into item;
    return jsonb_build_object('id',item.id,'path',item.storage_path,'mime',item.mime_type,'status',item.status);
  end if;
  select * into item from public.media_submissions where batch_id=batch.id and id=(payload->>'id')::uuid;
  if not found then return '{"error":"upload_unavailable"}'; end if;
  if action='claim' then
    if item.status='pending' then return jsonb_build_object('status','pending','receipt',batch.receipt_id); end if;
    if item.status<>'uploading' then return '{"error":"upload_unavailable"}'; end if;
    -- One bounded 50 MiB validation at a time across all Edge workers.
    if exists(select 1 from public.media_submissions where verification_expires_at>now()) then return '{"error":"busy"}'; end if;
    lease:=gen_random_uuid();
    update public.media_submissions set verification_lease=lease,verification_expires_at=now()+interval '3 minutes' where id=item.id;
    return jsonb_build_object('id',item.id,'path',item.storage_path,'mime',item.mime_type,'size',item.file_size,'lease',lease);
  elsif action in ('finish','invalid','release') then
    if item.verification_lease is distinct from (payload->>'lease')::uuid or item.verification_expires_at<=now() then return '{"error":"busy"}'; end if;
    update public.media_submissions set
      status=case action when 'finish' then 'pending' when 'invalid' then 'failed' else status end,
      file_sha256=case when action='finish' then payload->>'sha256' else file_sha256 end,
      verified_mime_type=case when action='finish' then payload->>'mime' else verified_mime_type end,
      verified_file_size=case when action='finish' then (payload->>'size')::bigint else verified_file_size end,
      finalized_at=case when action='finish' then now() else finalized_at end,
      failure_reason=case when action='invalid' then 'Stored media failed validation' else failure_reason end,
      verification_lease=null,verification_expires_at=null where id=item.id;
    return jsonb_build_object('status',case action when 'finish' then 'pending' when 'invalid' then 'failed' else 'uploading' end,'receipt',batch.receipt_id);
  elsif action='cancel' then
    if item.status='uploading' and (item.verification_expires_at is null or item.verification_expires_at<=now()) then
      update public.media_submissions set status='failed',failure_reason='Upload cancelled' where id=item.id;
      return '{"status":"failed"}';
    end if;
    return '{"error":"upload_unavailable"}';
  end if;
  return '{"error":"invalid_request"}';
end $$;
revoke all on function public.submission_intake(text,jsonb) from public,anon,authenticated;
grant execute on function public.submission_intake(text,jsonb) to service_role;

-- Refresh the private validation cache from unchanged canonical JSON; fixes legacy seed text encoding.
update public.submission_canonical_events set era='Close-Up' where id in ('closeup-departure','dining-hall-unification','valentin-breakfast','original-gc-created','cheddar-becomes-mascot','hotel-room-chat-bonding','closeup-online-games','cheddar-restricted','statue-liberty-photos','closeup-observation-photos','dash-leaves-closeup','gage-confession','return-flight-salute','first-lore-description','closeup-ends','closeup-photo-archive');
update public.submission_canonical_events set era='Summer 2024' where id in ('june5-hangout','original-chat-narrows','updated-gc','crushing-playlist','ale-kat-arrangement','lucas-lydia-arrangement','summer-arrangements-end');
update public.submission_canonical_events set era='8th Grade – Fall 2024' where id in ('reset-hangout','libby-added','lucas-leah','todd-aedan-integrate','saint-johns-model-un-2024','libby-zach','party-bus-adventure');
update public.submission_canonical_events set era='8th Grade – Winter 2025' where id in ('calm-january','chickfila','lucas-lydia-official','baldwin-model-un-2025');
update public.submission_canonical_events set era='8th Grade – Spring 2025' where id in ('spirit-week-2025','track-pantsing-prank','promposals','gage-beach','prom','caguas-botanical-garden','graduation','first-real-date','final-boys-sleepover');
update public.submission_canonical_events set era='Summer 2025' where id in ('france-departure','france-incident','lucas-return','confession-ghosting','core-four','trampoline','flower-apology','breakup','josie-alexander-official','samantha-added','chat-expansion','gage-return-hangout');
update public.submission_canonical_events set era='9th Grade – Fall 2025' where id in ('maria-integration','welcome-back-beach-party','shower-leak','ale-maria-no','halloween-split','serafina-added','brava','dash-music','ale-maria-date','spirit-conflict-start','first-practice','mix-two-presented','mix-two-wins','zach-move-news');
update public.submission_canonical_events set era='9th Grade – Winter 2026' where id in ('exploration-week','chilis','beef-start','tuna-segreles','ale-maria-reveal','lucas-sam-talk','model-un-winners','lydia-cat','lucas-sam-date','sword-gift','spirit-dance','dc-trip','battle-of-bands');
update public.submission_canonical_events set era='9th Grade – Spring 2026' where id in ('todd-mystery-notes','schedule-leak','josie-birthday','lucas-sam-reveal','sienna-added','future-class-meetings','maria-birthday-song','alejandro-moves-home','samantha-phone-missing','mary-poppins','leak-grade-wide','project-hail-mary','tyler-concert','school-model-un-2026','tomodachi-island','vaqueros-indios-feud','student-council-election','kamilo-bowling-birthday','physics-final-wendys');
update public.submission_canonical_events set era='Summer 2026' where id in ('nico-todd-peru-trip','zach-moves','alejandro-shaves-beard','charlee-joins-friend-group');
update public.submission_canonical_events set era='10th Grade – Fall 2026' where id in ('nj-week-2026','jeidenne-aedan-relationship','chilis-movie-hangout','alejandro-birthday-2026','friendship-edit-v2','october-psat-2026','stuco-medalla-arena-party');
