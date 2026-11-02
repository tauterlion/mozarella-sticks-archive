-- Local-tested moderator controls. No submission, archive or Storage data is deleted.
-- Immutable action records also provide idempotency for lost-response retries.
create table public.submission_moderation_actions (
 actor_id uuid not null references public.submission_moderators(user_id),
 request_id uuid not null,
 submission_id uuid not null references public.media_submissions(id),
 action text not null check (action in ('edit','approve','reject')),
 request jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(actor_id,request_id)
);
create index submission_moderation_actions_record_idx on public.submission_moderation_actions(submission_id,created_at desc);
alter table public.submission_moderation_actions enable row level security;
revoke all on public.submission_moderation_actions from public,anon,authenticated,service_role;
grant select,insert on public.submission_moderation_actions to service_role;

create function public.submission_review_write(actor uuid, session uuid, action text, payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item public.media_submissions; previous public.submission_moderation_actions;
 result jsonb; wanted_id uuid; operation uuid; expected bigint; old_version bigint;
begin
 if not aoms_private.moderator_session_valid(actor,session) then return jsonb_build_object('error','forbidden'); end if;
 if action is null or action not in ('edit','approve','reject') or jsonb_typeof(payload) is distinct from 'object' then
  return jsonb_build_object('error','invalid_request');
 end if;
 if exists(select 1 from jsonb_object_keys(payload) k where k not in ('id','requestId','version') and
    not (action='edit' and k in ('caption','eventId','people','noPeople','proposedTitle','proposedDate','proposedDetails')) and
    not (action='reject' and k='reason')) then return jsonb_build_object('error','invalid_request'); end if;
 wanted_id := (payload->>'id')::uuid; operation := (payload->>'requestId')::uuid;
 if wanted_id is null or operation is null or jsonb_typeof(payload->'version') is distinct from 'number' or
    (payload->>'version') !~ '^[1-9][0-9]{0,14}$' then return jsonb_build_object('error','invalid_request'); end if;
 expected := (payload->>'version')::bigint;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||operation::text,0));
 select * into previous from public.submission_moderation_actions a where a.actor_id=actor and a.request_id=operation;
 if found then
  if previous.action<>action or previous.request<>payload then return jsonb_build_object('error','request_reused'); end if;
  return previous.result;
 end if;
 select * into item from public.media_submissions where id=wanted_id for update;
 if not found then return jsonb_build_object('error','not_found'); end if;
 if item.version<>expected then return jsonb_build_object('error','conflict'); end if;
 if item.storage_purge_started_at is not null or item.storage_purged_at is not null then return jsonb_build_object('error','unavailable'); end if;
 if (action in ('edit','approve') and item.status<>'pending') or (action='reject' and item.status not in ('pending','approved')) then
  return jsonb_build_object('error','invalid_state');
 end if;
 if not aoms_private.moderator_session_valid(actor,session) then return jsonb_build_object('error','forbidden'); end if;
 old_version := item.version;
 if action='edit' then
  if jsonb_typeof(payload->'caption') is distinct from 'string' or
     jsonb_typeof(payload->'people') is distinct from 'array' or jsonb_typeof(payload->'noPeople') is distinct from 'boolean' or
     not (payload ?& array['eventId','proposedTitle','proposedDate','proposedDetails']) or
     exists(select 1 from jsonb_array_elements(payload->'people') x where jsonb_typeof(x)<>'string') then
   return jsonb_build_object('error','invalid_request');
  end if;
  update public.media_submissions set caption=payload->>'caption',event_id=payload->>'eventId',
   people_ids=array(select jsonb_array_elements_text(payload->'people')),no_people_to_tag=(payload->>'noPeople')::boolean,
   proposed_event_title=payload->>'proposedTitle',proposed_event_date=(payload->>'proposedDate')::date,
   proposed_event_details=payload->>'proposedDetails'
   where id=wanted_id returning * into item;
 elsif action='approve' then
  if item.event_id is null then return jsonb_build_object('error','event_required'); end if;
  update public.media_submissions set status='approved',reviewed_by=actor,reviewed_at=now(),review_notes=null
   where id=wanted_id returning * into item;
 else
  if jsonb_typeof(payload->'reason') is distinct from 'string' or char_length(payload->>'reason')>2000 then
   return jsonb_build_object('error','invalid_request');
  end if;
  update public.media_submissions set status='rejected',reviewed_by=actor,reviewed_at=now(),review_notes=nullif(btrim(payload->>'reason'),'')
   where id=wanted_id returning * into item;
 end if;
 result := jsonb_build_object('ok',true,'id',item.id,'status',item.status,'version',item.version,'previousVersion',old_version);
 insert into public.submission_moderation_actions(actor_id,request_id,submission_id,action,request,result)
  values(actor,operation,item.id,action,payload,result);
 return result;
exception when check_violation or foreign_key_violation or invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
 return jsonb_build_object('error','invalid_metadata');
end $$;
revoke all on function public.submission_review_write(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.submission_review_write(uuid,uuid,text,jsonb) to service_role;

-- Extend the existing authorized read path; preserve all existing capabilities.
create or replace function public.submission_review_read(actor uuid, session uuid, action text, payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb; wanted text; page_number integer; item public.media_submissions;
begin
 if not aoms_private.moderator_session_valid(actor,session) then
  return jsonb_build_object('error','forbidden');
 end if;
 if action='history' then
  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into result from (
   select a.actor_id,a.action,a.created_at,a.result->>'version' as version from public.submission_moderation_actions a
   where a.submission_id=(payload->>'id')::uuid order by a.created_at desc,a.request_id desc limit 100
  ) q;
  return jsonb_build_object('actions',result);
 end if;
 if action='session' then return jsonb_build_object('ok',true); end if;
 if action='list' then
  wanted := coalesce(payload->>'status','pending');
  page_number := coalesce((payload->>'page')::integer,0);
  if wanted not in ('pending','approved','rejected','published','removed') or page_number<0 or page_number>10000 then
   return jsonb_build_object('error','invalid_request');
  end if;
  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into result from (
   select id,created_at,status,caption,original_filename,mime_type,file_size,version
   from public.media_submissions where status=wanted
   order by created_at desc,id desc limit 25 offset page_number*25
  ) q;
  return jsonb_build_object('items',result,'page',page_number,
   'total',(select count(*) from public.media_submissions where status=wanted),
   'pendingCount',(select count(*) from public.media_submissions where status='pending'));
 end if;
 if action in ('detail','preview') then
  select * into item from public.media_submissions where id=(payload->>'id')::uuid
   and status in ('pending','approved','rejected','published','removed');
  if not found then return jsonb_build_object('error','not_found'); end if;
  if action='preview' then
   if item.storage_purged_at is not null or item.storage_purge_started_at is not null or item.status='removed' then
    return jsonb_build_object('error','not_found');
   end if;
   return jsonb_build_object('path',item.storage_path);
  end if;
  return jsonb_build_object('item', jsonb_build_object(
   'review_notes',item.review_notes,'id',item.id,'status',item.status,'version',item.version,'caption',item.caption,
   'event_id',item.event_id,'people_ids',item.people_ids,'no_people_to_tag',item.no_people_to_tag,
   'proposed_event_title',item.proposed_event_title,'proposed_event_date',item.proposed_event_date,
   'proposed_event_details',item.proposed_event_details,'original_filename',item.original_filename,
   'mime_type',item.mime_type,'file_size',item.file_size,'created_at',item.created_at));
 end if;
 return jsonb_build_object('error','invalid_request');
end $$;
revoke all on function public.submission_review_read(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.submission_review_read(uuid,uuid,text,jsonb) to service_role;
