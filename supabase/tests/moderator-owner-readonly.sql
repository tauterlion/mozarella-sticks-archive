-- Read-only local verification for the owner's disposable moderation workflow.
-- Run ONLY against the preserved isolated aoms-local PostgreSQL database.
-- No credentials, IDs, captions, file paths, or moderation reasons are printed.
-- This does not download file bytes or prove negative HTTP access: verify that separately.
begin transaction read only;

select
  (select intake_enabled from public.submission_settings where singleton) as local_intake_enabled,
  (select public from storage.buckets where id='aoms-submissions') as submission_bucket_public,
  (select count(*) from public.media_submissions) as submission_count,
  (select count(*) from storage.objects where bucket_id='aoms-submissions') as private_bucket_objects,
  (select count(*) from public.submission_moderators where active) as active_moderators,
  (select count(*) from public.submission_moderation_actions) as immutable_moderation_actions;

select action, count(*) as action_count
from public.submission_moderation_actions
group by action
order by action;

with action_history as (
  select
    submission_id,
    count(distinct actor_id) as actor_count,
    min((result->>'version')::bigint) filter (where action='edit') as edit_version,
    min((result->>'version')::bigint) filter (where action='approve') as approve_version,
    max((result->>'version')::bigint) filter (where action='reject') as reject_version
  from public.submission_moderation_actions
  group by submission_id
), completed as (
  select s.id, s.status, s.version, s.storage_path, s.file_sha256,
         s.published_at, s.github_commit_sha, s.public_media_id, s.public_asset_path,
         h.reject_version,
         exists (
           select 1 from storage.objects o
           where o.bucket_id='aoms-submissions' and o.name=s.storage_path
         ) as object_still_present
  from action_history h
  join public.media_submissions s on s.id=h.submission_id
  where h.actor_count=1
    and h.edit_version is not null
    and h.approve_version is not null
    and h.reject_version is not null
    and h.edit_version < h.approve_version
    and h.approve_version < h.reject_version
)
select
  count(*) as completed_edit_approve_reject_sequences,
  count(*) filter (where status='rejected' and version=reject_version) as rejected_with_expected_version,
  count(*) filter (where object_still_present) as private_objects_still_present,
  count(*) filter (where file_sha256 is not null) as records_with_verified_file_hash,
  count(*) filter (
    where published_at is null and github_commit_sha is null
      and public_media_id is null and public_asset_path is null
  ) as not_published
from completed;

commit;
