-- Additive, read-only moderation foundation. No row, bucket or intake changes.
-- Narrow DEFINER exception: service_role cannot read auth.sessions directly.
-- Return only a boolean; do not grant broad access to Auth session records.
create function aoms_private.moderator_session_valid(actor uuid, session uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (
  select 1 from public.submission_moderators m
  join auth.sessions s on s.user_id=m.user_id
  where m.user_id=actor and m.active and s.id=session and s.aal='aal2'
    and (s.not_after is null or s.not_after > now())
 );
$$;
revoke all on function aoms_private.moderator_session_valid(uuid,uuid) from public,anon,authenticated;
grant execute on function aoms_private.moderator_session_valid(uuid,uuid) to service_role;

-- Edge verifies the JWT with Auth before supplying these identities. Browser roles
-- cannot invoke this RPC, read tables, or mint previews directly.
create function public.submission_review_read(actor uuid, session uuid, action text, payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb; wanted text; page_number integer; item public.media_submissions;
begin
 if not aoms_private.moderator_session_valid(actor,session) then
  return jsonb_build_object('error','forbidden');
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
   'id',item.id,'status',item.status,'version',item.version,'caption',item.caption,
   'event_id',item.event_id,'people_ids',item.people_ids,'no_people_to_tag',item.no_people_to_tag,
   'proposed_event_title',item.proposed_event_title,'proposed_event_date',item.proposed_event_date,
   'proposed_event_details',item.proposed_event_details,'original_filename',item.original_filename,
   'mime_type',item.mime_type,'file_size',item.file_size,'created_at',item.created_at));
 end if;
 return jsonb_build_object('error','invalid_request');
end $$;
revoke all on function public.submission_review_read(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.submission_review_read(uuid,uuid,text,jsonb) to service_role;
