-- Three events added by reviewed archive main 9ca44fb. Preserve all existing catalog provenance.
do $$ begin
 if exists (
  select 1 from public.submission_canonical_events
  where id in ('halloween-sleepovers-2026','lorena-surprise-sweet-sixteen-2026','psat-scores-released-2026')
    and (era <> '10th Grade – Fall 2026' or source_commit <> '9ca44fbd2de2e431795874a057b37d63b6fb478f')
 ) then raise exception 'Review the conflicting canonical event before proceeding'; end if;
end $$;
insert into public.submission_canonical_events (id,era,source_commit)
select id,'10th Grade – Fall 2026','9ca44fbd2de2e431795874a057b37d63b6fb478f'
from unnest(array['halloween-sleepovers-2026','lorena-surprise-sweet-sixteen-2026','psat-scores-released-2026']) as ids(id)
on conflict (id) do nothing;
