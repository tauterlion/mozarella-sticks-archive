# Community Submissions — continuation checkpoint (2026-11-19)

This is a **handoff and verification plan**, not a release approval or a claim that the local environment was accessed. Preserve PR #18 as a draft; do not merge, publish, enable intake, recreate the moderator, delete records, or reset local Docker volumes.

## Last owner-observed workflow

On November 2, the owner used the existing isolated local moderator dashboard and reported successful interaction with a **disposable synthetic submission**: private image preview; edit and save metadata; approve; then reject. The screenshots show the event/people controls and the expected edit → approve → reject interface history. The reported edit included a selected canonical event and people. The assistant in that prior session said it would verify the immutable audit records and confirm that the original file remained private.

**Still unverified by the present handoff:** independent read-back of the saved audit rows and private Storage file after those owner actions, including the file's byte/hash integrity. Do not re-label the browser observation as a complete verified backend audit.

The last local branch documentation (Nov 2) describes the preserved `aoms-local` Docker volumes, original submissions/private objects, one owner moderator with MFA, and a separate disposable gold-image fixture. The preserved local Windows/Docker environment is **not connected to this session**. No commands have been run there during this handoff.

A non-destructive read-only SQL check now exists at `supabase/tests/moderator-owner-readonly.sql`. Run it **only against the same preserved isolated local database**. It reports aggregate state and action ordering without printing contributor data, UUIDs, captions or storage paths. Confirm the private object's original hash via the already-preserved local verification workflow, and independently test that anonymous HTTP reads remain denied. Do not reset the database or recreate the fixture to make a test pass.

## Current hosted boundary and drift

Read-only connected inspection on **Nov 19, 2026** identified hosted Supabase project `kvyrbtooynofijdtmqup` as **INACTIVE**. A migration-list read timed out, so the hosted DB schema, intake flag, row counts and live authorization state could not be independently reconfirmed. Supabase's Edge Function metadata reports `community-submit` as **ACTIVE, version 2**, with `verify_jwt=false`. This does not prove the inactive project's API is serving requests. It differs from the older document's version-1 inventory: reconcile deployed source/version against a saved export before making any production changes. **Do not restore/activate the hosted project or deploy functions without a distinct authorization and a preservation snapshot.**

The last *verified historical* hosted state was three foundation/intake migrations through `20261030232342`, private bucket and disabled intake. The signed-TUS correction and moderation functions were local/PR-only at that checkpoint. Do not silently assume that historical state is current while the project is inactive.

## Integration with subsequent AoMS updates

The public Timeline on `main` now has **115 events** after PR #20 (Halloween, PSAT results, and Lorena's Sweet Sixteen); Event Galleries 2.0 from PR #21 is also merged. The older submissions staging cache/documentation reports **112 canonical events** and 37 people. Before enabling public intake or using moderation against new events, reconcile the canonical catalog from reviewed current `main` through an **additive, explicitly reviewed cache refresh**; never wipe or overwrite submissions to sync IDs.

PR #18 currently changes only submissions/moderation/config/docs/tooling files and is still a draft. PR #18 must remain isolated from public deployment until release gates pass.

## Recommended continuation, in order

1. **Preserve and validate local state.** Reconnect to the existing `aoms-local` Windows/Docker stack; check original volumes, moderator enrollment/MFA, three preexisting submissions, original private object, and the disposable fixture before any service changes. Use the documented data-preserving restart procedure only; do not use `db reset`, `--no-backup` or delete volumes.
2. **Close the owner workflow evidence gap.** Run `supabase/tests/moderator-owner-readonly.sql` locally using read-only `psql`, verify ordered immutable edit/approve/reject actions, final rejected state, absence of publication, private bucket/object presence, and independent original-file hash match. Verify anonymous preview/list denial. Record sanitized counts and checks in this doc or PR, **not** credentials, UUIDs or private captions.
3. **Re-run applicable isolated tests** (intake/security, MFA, moderation, browser, archive). Do not run the disposable enrollment test against the occupied moderator allowlist; it explicitly refuses that state. Capture failures without altering original user data.
4. **Reconcile pending implementation gates:** interruption/replay/expiry/cancellation and quotas; automatic cleanup/retention with auditing; resource limits/monitoring; owner password/MFA recovery; canonical ID cache sync; normalized approved-media publication through reviewable GitHub PRs; verified removals and reconciliation. Approval and publication remain distinct.
5. **Only after review and explicit owner approval**, perform staged hosted DB/function deployment with backups and preservation comparisons; verify closed intake and no public access. Recheck the hosted project status and current function source first. Production intake remains disabled through this step.
6. **Public release is a separate decision** after tests, privacy/consent review, operational readiness, and an explicit go/no-go. PR merge or a function deployment is not equivalent to public intake authorization.

This document intentionally contains no account credentials, recovery secrets, service keys, media content, or person-specific submission data.
