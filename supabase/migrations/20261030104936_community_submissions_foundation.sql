-- Community Submissions M0/M1 foundation. No public policies or endpoints.
-- Refuse to reinterpret legacy submissions silently. Audit found this table empty.
do $$ begin
  if exists (select 1 from public.media_submissions) then
    raise exception 'Review and migrate existing submissions explicitly before applying this foundation';
  end if;
end $$;

create schema if not exists aoms_private;
revoke all on schema aoms_private from public, anon, authenticated;
grant usage on schema aoms_private to service_role;

create table public.submission_settings (
  singleton boolean primary key default true check (singleton),
  intake_enabled boolean not null default false,
  reserved_byte_budget bigint not null default 262144000 check (reserved_byte_budget > 0),
  max_inflight_per_batch integer not null default 3 check (max_inflight_per_batch between 1 and 10),
  public_derivative_max_bytes bigint not null default 26214400 check (public_derivative_max_bytes between 1 and 52428800),
  abandoned_retention interval not null default interval '24 hours',
  rejected_retention interval not null default interval '7 days',
  updated_at timestamptz not null default now()
);
insert into public.submission_settings (singleton) values (true);

-- Operator managed, one moderator only. Backend credentials cannot enroll themselves.
create table public.submission_moderators (
  user_id uuid primary key references auth.users(id) on delete restrict,
  singleton boolean not null unique default true check (singleton),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Validation cache, not a second editorial source. Refresh only from reviewed GitHub main.
create table public.submission_canonical_people (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  source_commit text not null check (source_commit ~ '^[0-9a-f]{40}$')
);
create table public.submission_canonical_events (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  era text not null,
  source_commit text not null check (source_commit ~ '^[0-9a-f]{40}$')
);

create table public.submission_batches (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours',
  capability_sha256 text not null unique check (capability_sha256 ~ '^[0-9a-f]{64}$'),
  captcha_verified_at timestamptz not null,
  captcha_token_sha256 text not null unique check (captcha_token_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'open' check (status in ('open','closed','expired')),
  check (expires_at > created_at and expires_at <= created_at + interval '2 hours'),
  check (captcha_verified_at <= created_at and captcha_verified_at >= created_at - interval '5 minutes')
);

-- Short-lived keyed signals only. Counter mutation must be transactional in M1 RPCs.
create table public.submission_rate_limits (
  scope text not null check (scope in ('initiate','finalize','report','global')),
  subject_hmac text not null check (subject_hmac ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  expires_at timestamptz not null,
  request_count bigint not null default 0 check (request_count >= 0),
  reserved_bytes bigint not null default 0 check (reserved_bytes >= 0),
  primary key (scope, subject_hmac, window_start),
  check (expires_at > window_start and expires_at <= window_start + interval '24 hours')
);
create index submission_rate_limits_expiry_idx on public.submission_rate_limits(expires_at);

alter table public.media_submissions
  alter column display_name drop not null,
  alter column event_id drop not null,
  alter column status set default 'uploading',
  alter column storage_path set not null,
  add column batch_id uuid not null references public.submission_batches(id),
  add column client_file_id uuid not null,
  add column proposed_event_title text,
  add column proposed_event_date date,
  add column proposed_event_details text,
  add column no_people_to_tag boolean not null default false,
  add column consent_confirmed_at timestamptz not null,
  add column consent_version text not null default 'community-v1' check (consent_version = 'community-v1'),
  add column file_sha256 text check (file_sha256 ~ '^[0-9a-f]{64}$'),
  add column verified_mime_type text check (verified_mime_type in ('image/jpeg','image/png','image/webp','video/mp4','video/webm')),
  add column verified_file_size bigint check (verified_file_size between 1 and 52428800),
  add column finalized_at timestamptz,
  add column reviewed_by uuid references public.submission_moderators(user_id),
  add column published_at timestamptz,
  add column github_pr_url text,
  add column github_commit_sha text check (github_commit_sha ~ '^[0-9a-f]{40}$'),
  add column public_media_id text check (public_media_id ~ '^[a-z0-9][a-z0-9-]{0,199}$'),
  add column public_asset_path text,
  add column removed_at timestamptz,
  add column failure_reason text check (char_length(failure_reason) <= 2000),
  add column version bigint not null default 1 check (version > 0),
  add column updated_at timestamptz not null default now(),
  add constraint submission_anonymous_only check (display_name is null and submitted_by is null),
  add constraint submission_caption_nonblank check (char_length(btrim(caption)) between 1 and 500),
  add constraint submission_event_choice check (
    (event_id is not null and proposed_event_title is null and proposed_event_date is null and proposed_event_details is null)
    or (event_id is null and proposed_event_title is not null and char_length(btrim(proposed_event_title)) between 1 and 160
        and proposed_event_details is not null and char_length(btrim(proposed_event_details)) between 1 and 2000)
  ),
  add constraint submission_people_choice check (
    cardinality(people_ids) <= 100 and array_position(people_ids,null) is null
    and ((cardinality(people_ids) = 0 and no_people_to_tag) or (cardinality(people_ids) > 0 and not no_people_to_tag))
  ),
  add constraint submission_path check (storage_path = 'incoming/' || batch_id::text || '/' || id::text),
  add constraint submission_client_idempotency unique (batch_id,client_file_id),
  add constraint submission_canonical_event foreign key (event_id) references public.submission_canonical_events(id),
  add constraint submission_finalized check (status not in ('pending','approved','publishing','published','removed') or
    (file_sha256 is not null and verified_mime_type is not null and verified_file_size is not null and finalized_at is not null)),
  add constraint submission_verified_matches check (verified_mime_type = mime_type and verified_file_size = file_size),
  add constraint submission_reviewed check (status not in ('approved','publishing','published','removed') or (reviewed_at is not null and reviewed_by is not null)),
  add constraint submission_publish_mapping check (status not in ('published','removed') or
    (published_at is not null and github_commit_sha is not null and github_pr_url is not null and public_media_id is not null and public_asset_path is not null)),
  add constraint submission_github_pr check (github_pr_url ~ '^https://github[.]com/tauterlion/mozarella-sticks-archive/pull/[1-9][0-9]*$'),
  add constraint submission_asset_path check (public_asset_path ~ '^assets/media/[a-z0-9][a-z0-9-]*[.](jpg|png|webp|mp4|webm)$'),
  add constraint submission_removed check (status <> 'removed' or removed_at is not null);
alter table public.media_submissions drop constraint media_submissions_status_check;
alter table public.media_submissions add constraint media_submissions_status_check
  check (status in ('uploading','pending','approved','publishing','published','rejected','failed','removed'));
create unique index submission_public_media_idx on public.media_submissions(public_media_id) where public_media_id is not null;
create index submission_queue_idx on public.media_submissions(status,created_at desc,id);
create index submission_batch_idx on public.media_submissions(batch_id);
create index submission_reviewed_by_idx on public.media_submissions(reviewed_by);
create index submission_submitted_by_idx on public.media_submissions(submitted_by);
create index submission_event_idx on public.media_submissions(event_id);

create table public.submission_audit (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.media_submissions(id) on delete restrict,
  actor_id uuid references public.submission_moderators(user_id),
  action text not null check (char_length(action) between 1 and 80),
  occurred_at timestamptz not null default now(),
  from_status text,
  to_status text,
  record_version bigint not null
);
create index submission_audit_record_idx on public.submission_audit(submission_id,occurred_at);
create index submission_audit_actor_idx on public.submission_audit(actor_id);

-- Non-public request inbox; verification must happen before any public removal.
create table public.media_removal_requests (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null unique default gen_random_uuid(),
  public_media_id text not null check (public_media_id ~ '^[a-z0-9][a-z0-9-]{0,199}$'),
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  created_at timestamptz not null default now(),
  status text not null default 'received' check (status in ('received','verifying','verified','dismissed','removed')),
  verified_by uuid references public.submission_moderators(user_id),
  verified_at timestamptz,
  verification_notes text check (char_length(verification_notes) <= 2000),
  removed_at timestamptz,
  check (status not in ('verified','removed') or (verified_by is not null and verified_at is not null)),
  check (status <> 'removed' or removed_at is not null)
);
create index removal_status_idx on public.media_removal_requests(status,created_at);
create index removal_verified_by_idx on public.media_removal_requests(verified_by);

-- SECURITY INVOKER: this is a constraint, not an authorization shortcut or public RPC.
create function aoms_private.guard_submission() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not coalesce((select intake_enabled from public.submission_settings where singleton),false) then
      raise exception 'Submission intake disabled' using errcode = '23514';
    end if;
    if new.status <> 'uploading' then raise exception 'New records must start uploading' using errcode = '23514'; end if;
    if not exists (select 1 from public.submission_batches where id=new.batch_id and status='open' and expires_at>now()) then
      raise exception 'Batch unavailable or expired' using errcode='23514';
    end if;
  else
    if new.id <> old.id or new.batch_id <> old.batch_id or new.client_file_id <> old.client_file_id
      or new.storage_path <> old.storage_path or new.original_filename <> old.original_filename
      or new.file_size <> old.file_size or new.mime_type <> old.mime_type or new.created_at <> old.created_at
      or new.consent_confirmed_at <> old.consent_confirmed_at then
      raise exception 'Original upload identity is immutable' using errcode='23514';
    end if;
    if new.status <> old.status and not (
      (old.status='uploading' and new.status in ('pending','failed')) or
      (old.status='pending' and new.status in ('approved','rejected','failed')) or
      (old.status='approved' and new.status in ('publishing','rejected')) or
      (old.status='publishing' and new.status in ('published','approved')) or
      (old.status='published' and new.status='removed') or
      (old.status='rejected' and new.status='pending')
    ) then raise exception 'Invalid submission state transition' using errcode='23514'; end if;
    if old.status='uploading' and new.status='pending' and not exists
      (select 1 from public.submission_batches where id=new.batch_id and status='open' and expires_at>now()) then
      raise exception 'Cannot finalize expired batch' using errcode='23514';
    end if;
    if new.status <> old.status and new.status in ('approved','rejected','removed') and not exists
      (select 1 from public.submission_moderators where user_id=new.reviewed_by and active) then
      raise exception 'Active moderator required' using errcode='23514';
    end if;
    if old.finalized_at is not null and (new.file_sha256 is distinct from old.file_sha256
      or new.verified_mime_type is distinct from old.verified_mime_type or new.verified_file_size is distinct from old.verified_file_size
      or new.finalized_at is distinct from old.finalized_at) then
      raise exception 'Verified original is immutable' using errcode='23514';
    end if;
    if old.status in ('publishing','published','removed') and (new.caption is distinct from old.caption
      or new.event_id is distinct from old.event_id or new.people_ids is distinct from old.people_ids) then
      raise exception 'Public metadata requires a new reviewed publishing operation' using errcode='23514';
    end if;
    if new.status='removed' and old.status='published' and not exists
      (select 1 from public.media_removal_requests where public_media_id=new.public_media_id and status='verified') then
      raise exception 'Verified takedown required' using errcode='23514';
    end if;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  if exists (select 1 from unnest(new.people_ids) p where not exists (select 1 from public.submission_canonical_people c where c.id=p)) then
    raise exception 'Unknown canonical person' using errcode='23514';
  end if;
  if cardinality(new.people_ids) <> (select count(distinct p) from unnest(new.people_ids) p) then
    raise exception 'Duplicate person tags' using errcode='23514';
  end if;
  if new.status in ('approved','publishing','published','removed') and new.event_id is null then
    raise exception 'Map proposal to a canonical event before approval' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function aoms_private.guard_submission() from public,anon,authenticated;
grant execute on function aoms_private.guard_submission() to service_role;
create trigger guard_submission before insert or update on public.media_submissions for each row execute function aoms_private.guard_submission();

create function aoms_private.audit_submission() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.submission_audit(submission_id,actor_id,action,from_status,to_status,record_version)
  values (new.id,case when new.status in ('approved','rejected','removed') then new.reviewed_by else null end,
    case when tg_op='INSERT' then 'created' when new.status <> old.status then 'status_changed' else 'metadata_updated' end,
    case when tg_op='INSERT' then null else old.status end,new.status,new.version);
  return new;
end $$;
revoke all on function aoms_private.audit_submission() from public,anon,authenticated;
grant execute on function aoms_private.audit_submission() to service_role;
create trigger audit_submission after insert or update on public.media_submissions for each row execute function aoms_private.audit_submission();

-- No policies: browser roles get neither privileges nor an RLS path.
do $$ declare t text; begin
  foreach t in array array['media_submissions','submission_settings','submission_moderators','submission_canonical_people',
    'submission_canonical_events','submission_batches','submission_rate_limits','submission_audit','media_removal_requests'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role',t);
  end loop;
end $$;
grant select on public.submission_settings,public.submission_moderators,public.submission_canonical_people,public.submission_canonical_events to service_role;
grant select,insert,update on public.media_submissions,public.submission_batches,public.submission_rate_limits,public.media_removal_requests to service_role;
grant delete on public.submission_rate_limits to service_role;
grant select,insert on public.submission_audit to service_role;
revoke all on sequence public.submission_audit_id_seq from public,anon,authenticated;
grant usage on sequence public.submission_audit_id_seq to service_role;

-- Confirm existing bucket security; do not modify Storage object rows via SQL.
do $$ begin
 if not exists (select 1 from storage.buckets where id='aoms-submissions' and not public and file_size_limit=52428800
   and allowed_mime_types @> array['image/jpeg','image/png','image/webp','video/mp4','video/webm']
   and cardinality(allowed_mime_types)=5) then raise exception 'Private bucket configuration does not match audited settings'; end if;
end $$;

insert into public.submission_canonical_people (id, source_commit) values
('aedan', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('alejandro', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('alexander', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('charlee', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('dash', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('gage', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('jeidenne', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('josie', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('kamilo', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('kateryna', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('leo', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('libby', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('lorena', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('lucas', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('lydia', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('marco', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('maria', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('marife', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('nicholas', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('samantha', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('sebastian', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('serafina', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('shane', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('sienna', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('todd', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('allysa', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('bash', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('bianca', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('cynthia', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('dominique', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('isabel', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('jaime', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('leah', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('lorena-rodriguez', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('valentin', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('zach', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('valentina', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c');

insert into public.submission_canonical_events (id, era, source_commit) values
('closeup-departure', 'Close-Up', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('dining-hall-unification', 'Close-Up', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('valentin-breakfast', 'Close-Up', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('original-gc-created', 'Close-Up', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('cheddar-becomes-mascot', 'Close-Up', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('hotel-room-chat-bonding', 'Close-Up', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('closeup-online-games', 'Close-Up', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('cheddar-restricted', 'Close-Up', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('statue-liberty-photos', 'Close-Up', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('closeup-observation-photos', 'Close-Up', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('dash-leaves-closeup', 'Close-Up', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('gage-confession', 'Close-Up', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('return-flight-salute', 'Close-Up', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('first-lore-description', 'Close-Up', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('closeup-ends', 'Close-Up', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('closeup-photo-archive', 'Close-Up', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('june5-hangout', 'Summer 2024', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('original-chat-narrows', 'Summer 2024', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('updated-gc', 'Summer 2024', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('crushing-playlist', 'Summer 2024', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('ale-kat-arrangement', 'Summer 2024', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('lucas-lydia-arrangement', 'Summer 2024', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('summer-arrangements-end', 'Summer 2024', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('reset-hangout', '8th Grade â€“ Fall 2024', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('libby-added', '8th Grade â€“ Fall 2024', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('lucas-leah', '8th Grade â€“ Fall 2024', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('todd-aedan-integrate', '8th Grade â€“ Fall 2024', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('saint-johns-model-un-2024', '8th Grade â€“ Fall 2024', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('libby-zach', '8th Grade â€“ Fall 2024', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('party-bus-adventure', '8th Grade â€“ Fall 2024', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('calm-january', '8th Grade â€“ Winter 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('chickfila', '8th Grade â€“ Winter 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('lucas-lydia-official', '8th Grade â€“ Winter 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('baldwin-model-un-2025', '8th Grade â€“ Winter 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('spirit-week-2025', '8th Grade â€“ Spring 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('track-pantsing-prank', '8th Grade â€“ Spring 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('promposals', '8th Grade â€“ Spring 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('gage-beach', '8th Grade â€“ Spring 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('prom', '8th Grade â€“ Spring 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('caguas-botanical-garden', '8th Grade â€“ Spring 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('graduation', '8th Grade â€“ Spring 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('first-real-date', '8th Grade â€“ Spring 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('final-boys-sleepover', '8th Grade â€“ Spring 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('france-departure', 'Summer 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('france-incident', 'Summer 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('lucas-return', 'Summer 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('confession-ghosting', 'Summer 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('core-four', 'Summer 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('trampoline', 'Summer 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('flower-apology', 'Summer 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('breakup', 'Summer 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('josie-alexander-official', 'Summer 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('samantha-added', 'Summer 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('chat-expansion', 'Summer 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('gage-return-hangout', 'Summer 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('maria-integration', '9th Grade â€“ Fall 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('welcome-back-beach-party', '9th Grade â€“ Fall 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('shower-leak', '9th Grade â€“ Fall 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('ale-maria-no', '9th Grade â€“ Fall 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('halloween-split', '9th Grade â€“ Fall 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('serafina-added', '9th Grade â€“ Fall 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('brava', '9th Grade â€“ Fall 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('dash-music', '9th Grade â€“ Fall 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('ale-maria-date', '9th Grade â€“ Fall 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('spirit-conflict-start', '9th Grade â€“ Fall 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('first-practice', '9th Grade â€“ Fall 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('mix-two-presented', '9th Grade â€“ Fall 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('mix-two-wins', '9th Grade â€“ Fall 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('zach-move-news', '9th Grade â€“ Fall 2025', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('exploration-week', '9th Grade â€“ Winter 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('chilis', '9th Grade â€“ Winter 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('beef-start', '9th Grade â€“ Winter 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('tuna-segreles', '9th Grade â€“ Winter 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('ale-maria-reveal', '9th Grade â€“ Winter 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('lucas-sam-talk', '9th Grade â€“ Winter 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('model-un-winners', '9th Grade â€“ Winter 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('lydia-cat', '9th Grade â€“ Winter 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('lucas-sam-date', '9th Grade â€“ Winter 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('sword-gift', '9th Grade â€“ Winter 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('spirit-dance', '9th Grade â€“ Winter 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('dc-trip', '9th Grade â€“ Winter 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('battle-of-bands', '9th Grade â€“ Winter 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('todd-mystery-notes', '9th Grade â€“ Spring 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('schedule-leak', '9th Grade â€“ Spring 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('josie-birthday', '9th Grade â€“ Spring 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('lucas-sam-reveal', '9th Grade â€“ Spring 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('sienna-added', '9th Grade â€“ Spring 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('future-class-meetings', '9th Grade â€“ Spring 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('maria-birthday-song', '9th Grade â€“ Spring 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('alejandro-moves-home', '9th Grade â€“ Spring 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('samantha-phone-missing', '9th Grade â€“ Spring 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('mary-poppins', '9th Grade â€“ Spring 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('leak-grade-wide', '9th Grade â€“ Spring 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('project-hail-mary', '9th Grade â€“ Spring 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('tyler-concert', '9th Grade â€“ Spring 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('school-model-un-2026', '9th Grade â€“ Spring 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('tomodachi-island', '9th Grade â€“ Spring 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('vaqueros-indios-feud', '9th Grade â€“ Spring 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('student-council-election', '9th Grade â€“ Spring 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('kamilo-bowling-birthday', '9th Grade â€“ Spring 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('physics-final-wendys', '9th Grade â€“ Spring 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('nico-todd-peru-trip', 'Summer 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('zach-moves', 'Summer 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('alejandro-shaves-beard', 'Summer 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('charlee-joins-friend-group', 'Summer 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('nj-week-2026', '10th Grade â€“ Fall 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('jeidenne-aedan-relationship', '10th Grade â€“ Fall 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('chilis-movie-hangout', '10th Grade â€“ Fall 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('alejandro-birthday-2026', '10th Grade â€“ Fall 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('friendship-edit-v2', '10th Grade â€“ Fall 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('october-psat-2026', '10th Grade â€“ Fall 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c'),
('stuco-medalla-arena-party', '10th Grade â€“ Fall 2026', 'ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c');
