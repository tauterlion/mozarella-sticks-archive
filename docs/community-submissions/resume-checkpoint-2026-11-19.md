# Community Submissions — continuation checkpoint (2026-11-19)

Draft PR #18 tracks the completed local moderation workflow and the remaining release work.

## Verified local moderation workflow

On November 2, the owner previewed the private synthetic image, edited its event and people tags, approved the submission, then rejected it in the local moderator dashboard. On November 19, the preserved `aoms-local` Docker stack was brought back up and the read-only check in `supabase/tests/moderator-owner-readonly.sql` confirmed exactly one edit, approval and rejection in version order, all by the same moderator. The fixture ended rejected at version 6 with all publication fields empty.

The local database retained four submissions (three original records and the disposable fixture), two private Storage objects and one active moderator. Authenticated Storage downloads matched the stored verified byte counts and SHA-256 hashes for both files. Anonymous public Storage reads were denied for both objects, and unauthenticated moderator list and preview calls returned HTTP 401. Verification used the existing volumes, account, submission records and files.

The isolated foundation, intake and moderation database suites passed again, along with 76 gateway/upload security tests, 29 mocked moderation browser checks, 23 submission browser checks, 15 Python tests and archive validation with zero errors or warnings. The live owner MFA flow was completed earlier. The disposable MFA suite requires an empty allowlist, so it was not rerun against the enrolled owner account.

## Hosted findings

Supabase management metadata reports project `kvyrbtooynofijdtmqup` as `INACTIVE` (paused), and the organization is on the Free plan. Automatic pausing for low activity is the leading explanation given the closed site and the Free-plan policy. The project metadata does not identify the trigger. The available application logs returned no relevant recent entries, and organization-level Platform Audit Logs require Team or Enterprise. The owner's Supabase pause notice would be the best way to confirm the trigger and pause date. See [Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing) and [Platform Audit Logs](https://supabase.com/docs/guides/security/platform-audit-logs).

`community-submit` is the only function in management inventory. It is labeled `ACTIVE`, version 2, with `verify_jwt=false`. The retrieved `index.ts`, `handler.mjs`, and `validation.mjs` match the historical deployment commit `7b94618` after normalizing line endings and trailing whitespace. This reconciles the source with the older v1 record, while the version number in the current inventory is 2. The deployed source has the earlier upload URL and does not have the branch's signed-TUS `/sign` correction. `community-review` is absent from hosted inventory. Function metadata does not establish live reachability.

Migration listing timed out. The database read of `submission_settings.intake_enabled` reported the database inaccessible, and the project API hostname did not resolve from the Windows host. The last verified historical inventory remains the three migrations through `20261030232342`, a private bucket, and intake disabled. The current hosted migration history and database switch need read-back after a separately approved restore. Both PR feature switches are false. The live Gallery returned HTTP 200 without a submission link, and the submission form and config paths returned HTTP 404. Hosted investigation was read-only.

## Local canonical event catalog

On November 19 the `aoms-local` PostgreSQL cache was synchronized to the reviewed Timeline at `main` commit `9ca44fbd2de2e431795874a057b37d63b6fb478f`. The existing 112 IDs and eras matched exactly. Three rows were added with that commit as their source:

- `halloween-sleepovers-2026`
- `lorena-surprise-sweet-sixteen-2026`
- `psat-scores-released-2026`

All three use the era `10th Grade – Fall 2026`. The original 112 rows still cite their existing source commit `ad4f6b142fc0e3fc61f4bfc010e67b33b3168b1c`. The committed catalog exactly matches all 115 reviewed IDs and eras. The synchronization locked the catalog for the insert, checked exact ID/era parity, and compared before/after row digests in the same transaction for the four submissions, batches, audit records, moderator enrollment, Auth user, MFA factor, intake settings, people cache and private Storage metadata. Both stored files independently matched their verified sizes and SHA-256 hashes after the sync. Anonymous reads remained denied and the existing volumes were retained.

A rollback-only local intake test accepted each new ID and stored its expected association. The foundation suite, 25 intake checks, 46 moderation database checks, 76 security tests, and archive validation passed on the feature checkout. The local database sync is separate from the PR's checked-in Timeline and migration fixtures, which still use 112 events. The public site and the hosted catalog were outside the sync.

## Recommended continuation, in order

1. **Reconcile pending implementation gates:** interruption/replay/expiry/cancellation and quotas; automatic cleanup/retention with auditing; resource limits/monitoring; owner password/MFA recovery; align the feature branch Timeline and eventual hosted cache with reviewed main; normalized approved-media publication through reviewable GitHub PRs; verified removals and reconciliation. Approval and publication remain distinct.
2. **Only after review and explicit owner approval**, perform staged hosted DB/function deployment with backups and preservation comparisons; verify closed intake and no public access. Recheck the hosted project status and current function source first. Production intake remains disabled through this step.
3. **Public release is a separate decision** after tests, privacy/consent review, operational readiness, and an explicit go/no-go. PR merge or a function deployment is not equivalent to public intake authorization.

This document intentionally contains no account credentials, recovery secrets, service keys, media content, or person-specific submission data.
