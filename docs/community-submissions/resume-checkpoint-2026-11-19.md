# Community Submissions — continuation checkpoint (2026-11-19)

Draft PR #18 tracks the completed local moderation workflow and the remaining release work.

## Verified local moderation workflow

On November 2, the owner previewed the private synthetic image, edited its event and people tags, approved the submission, then rejected it in the local moderator dashboard. On November 19, the preserved `aoms-local` Docker stack was brought back up and the read-only check in `supabase/tests/moderator-owner-readonly.sql` confirmed exactly one edit, approval and rejection in version order, all by the same moderator. The fixture ended rejected at version 6 with all publication fields empty.

The local database retained four submissions (three original records and the disposable fixture), two private Storage objects and one active moderator. Authenticated Storage downloads matched the stored verified byte counts and SHA-256 hashes for both files. Anonymous public Storage reads were denied for both objects, and unauthenticated moderator list and preview calls returned HTTP 401. Verification used the existing volumes, account, submission records and files.

The isolated foundation, intake and moderation database suites passed again, along with 76 gateway/upload security tests, 29 mocked moderation browser checks, 23 submission browser checks, 15 Python tests and archive validation with zero errors or warnings. The live owner MFA flow was completed earlier. The disposable MFA suite requires an empty allowlist, so it was not rerun against the enrolled owner account.

## Current hosted boundary and drift

Read-only connected inspection on **Nov 19, 2026** identified hosted Supabase project `kvyrbtooynofijdtmqup` as **INACTIVE**. A migration-list read timed out, so the hosted DB schema, intake flag, row counts and live authorization state could not be independently reconfirmed. Supabase's Edge Function metadata reports `community-submit` as **ACTIVE, version 2**, with `verify_jwt=false`. This does not prove the inactive project's API is serving requests. It differs from the older document's version-1 inventory: reconcile deployed source/version against a saved export before making any production changes. **Do not restore/activate the hosted project or deploy functions without a distinct authorization and a preservation snapshot.**

The last *verified historical* hosted state was three foundation/intake migrations through `20261030232342`, private bucket and disabled intake. The signed-TUS correction and moderation functions were local/PR-only at that checkpoint. Do not silently assume that historical state is current while the project is inactive.

## Integration with subsequent AoMS updates

The public Timeline on `main` now has **115 events** after PR #20 (Halloween, PSAT results, and Lorena's Sweet Sixteen); Event Galleries 2.0 from PR #21 is also merged. The older submissions staging cache/documentation reports **112 canonical events** and 37 people. Before enabling public intake or using moderation against new events, reconcile the canonical catalog from reviewed current `main` through an **additive, explicitly reviewed cache refresh**; never wipe or overwrite submissions to sync IDs.

PR #18 currently changes only submissions/moderation/config/docs/tooling files and is still a draft. PR #18 must remain isolated from public deployment until release gates pass.

## Recommended continuation, in order

1. **Reconcile pending implementation gates:** interruption/replay/expiry/cancellation and quotas; automatic cleanup/retention with auditing; resource limits/monitoring; owner password/MFA recovery; canonical ID cache sync; normalized approved-media publication through reviewable GitHub PRs; verified removals and reconciliation. Approval and publication remain distinct.
2. **Only after review and explicit owner approval**, perform staged hosted DB/function deployment with backups and preservation comparisons; verify closed intake and no public access. Recheck the hosted project status and current function source first. Production intake remains disabled through this step.
3. **Public release is a separate decision** after tests, privacy/consent review, operational readiness, and an explicit go/no-go. PR merge or a function deployment is not equivalent to public intake authorization.

This document intentionally contains no account credentials, recovery secrets, service keys, media content, or person-specific submission data.
