-- A bounded, capability-scoped outcome lookup makes expiry rollover safe even
-- when the last finalization response was lost. No read URL or metadata is returned.
create function public.submission_expired_outcome(capability_hash text, client_file_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare batch public.submission_batches; item public.media_submissions;
begin
 -- Serialize with authorize and finish. Mark the expired batch closed so a
 -- finish request started before expiry cannot commit after a retry decision.
 perform pg_catalog.pg_advisory_xact_lock(74121,1);
 if not coalesce((select intake_enabled from public.submission_settings where singleton),false) then
   return jsonb_build_object('error','intake_disabled');
 end if;
 select * into batch from public.submission_batches b where b.capability_sha256=capability_hash
   and b.expires_at<=clock_timestamp() and b.expires_at+interval '26 hours'>clock_timestamp();
 if not found then return jsonb_build_object('error','recovery_unavailable'); end if;
 update public.submission_batches set status='expired' where id=batch.id and status='open';
 select * into item from public.media_submissions m where m.batch_id=batch.id and m.client_file_id=submission_expired_outcome.client_file_id;
 if item.finalized_at is not null then return jsonb_build_object('status','received','receipt',batch.receipt_id); end if;
 if item.status='failed' then return jsonb_build_object('status','failed'); end if;
 return jsonb_build_object('status','retry');
end $$;
revoke all on function public.submission_expired_outcome(text,uuid) from public,anon,authenticated;
grant execute on function public.submission_expired_outcome(text,uuid) to service_role;
