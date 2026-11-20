# Milestone 4 — controlled rollout review

Draft PR #18, review only. See the [Milestone 5 reliability record](operational-reliability.md) for the real-browser transport, test-clock retention, and scheduling evidence. No hosting changes are part of this milestone. The next approval should cover a specific closed-intake rollout against the existing project `kvyrbtooynofijdtmqup`.

## Current baseline

The latest read-only hosted check returned `ACTIVE_HEALTHY`, the original three migrations through `20261030232342`, and `community-submit` v3 alone. Its artifact checksum matches the earlier historical deployment. The DB switch is false and both committed frontend switches are false. The hosted bucket is private. Submissions, Storage objects and moderators are all zero, and the catalog has 112 events and 37 people. Repeat these queries immediately before an approved deployment. See [the previous preservation inventory](resume-checkpoint-2026-11-19.md).

The feature branch includes reviewed `main` at `9ca44fb`, including its 115-event Timeline and Event Galleries 2.0. The local catalog has the same 115 events and 37 people. The development credentials and local moderator enrollment belong only to `aoms-local`.

## Proposed production sequence

1. Pin the reviewed branch SHA and record the hosted project ref, health, migration names, function versions/checksums and exported function source. Capture read-only counts, catalog ID/era/provenance comparisons, bucket settings and Storage object inventory, submission associations, audit counts and moderator enrollment counts. Take a data-preserving database backup or confirm a recoverable platform backup and separately establish how private Storage bytes would be preserved. Keep credentials and any private export outside Git.
2. Keep both frontend switches false and confirm database intake false before continuing. If any inventory differs, stop and reconcile it with the owner. In particular, the reviewed event update expects the three named additions and the 112 old IDs/eras to match `main`. The original three hosted migrations are a dependency and are already recorded.
3. Review and apply only these pending migrations in order, one at a time, with a preservation check after each. These are separate approved operations. Preserve the original three applied files.

   | Migration | Dependency and verification |
   | --- | --- |
   | `20261101215947_moderator_read_access` | Existing singleton allowlist and Auth session schema. Verify restricted RPCs and deny direct browser-role execution. |
   | `20261102111947_moderator_controls` | The read-access migration. Adds audited/versioned writes and extends review reads. Verify grant boundaries and preserved audit history. |
   | `20261120001706_event_catalog_115` | Existing canonical catalog. Adds three reviewed event rows and retains all old provenance. Recompare exact ID/era sets and existing associations. |
   | `20261120001707_submission_expiry_recovery` | The existing intake RPC and its transaction lock. Adds a service-role-only recovery RPC. Verify that closed intake rejects recovery and browser roles have no execute privilege. |
   | `20261120005042_submission_cleanup_leases` | Existing reservation and audit schema plus scoped service-role Storage metadata reads. Verify report-only access, legacy cleanup fencing, and active lease confirmation. Keep deletion scheduling off. |

4. Once SQL and catalog checks pass, deploy `community-submit` and `community-review` individually from that pin using the named project ref and the checked-in JWT settings. Preserve the exact origin and Turnstile hostname configuration. The corrected Storage transport is the signed TUS endpoint. The gateway handles anonymous authorization, while the moderator handler validates the Auth user and MFA on each request and checks live session and allowlist in SQL. A missing recovery RPC is a stop condition before deploying the new intake function. Leave the cleanup worker unscheduled.
5. Verify function hashes and named route responses. Confirm database intake false before a closed-intake HTTP check, including the new `recover` action. Recheck grants and RLS, private bucket settings, anonymous Storage reads and submission/list denial, moderator 401/403, and all preservation counts. Run security advisors. Positive upload tests belong in isolated staging. Keep the public Gallery and frontend switches closed.
6. Separately approve production owner enrollment. Invite/create only the owner's dedicated hosted Supabase Auth user via a trusted operator interface. Disable self-signup and anonymous Auth while keeping email/password sign-in available. Verify the exact hosted Auth UUID with the owner, then add the sole active allowlist entry. The owner sets their password and scans the TOTP QR privately. Test password-only denial, successful MFA, sign-out revocation, deactivation, and recovery. A public publishable key may be used by the moderator browser. Service keys and credentials remain in their approved stores.

## Partial failure and recovery

Stop at the failed step and collect the exact migration history, function inventory and preservation snapshots. If a migration fails, inspect the resulting schema and verify its recorded version before retrying. Apply only a reviewed forward correction if needed. If a function fails, keep the UI and intake closed. Recover by restoring that function from its exported source with its recorded settings, under separate approval. The older intake source provides a closed-service fallback. Keep new additive SQL in place unless a separately reviewed data recovery procedure requires otherwise. Preserve submission rows, event links, Storage objects, reservations, Auth accounts, allowlist entries, and audit records. Treat function rollback, account lockout and database recovery as distinct procedures. See [operations.md](operations.md) for verification commands.

Emergency controls are disabled intake, disabled public switches, and, for a moderator incident, deactivation plus Auth session revocation. Already-issued write capabilities can outlive the page. Keep the Storage reservation and wait for the token/TUS expiry horizon and retention rules before deleting. Keep a small incident log with timestamp, scope, evidence, provider response and owner approval. Never log credentials or signed URLs.

## Local verification commands

Run from the repository root with the existing test-only Docker stack. The browser suites use the documented `PLAYWRIGHT_MODULE` and `CHROME_BIN` settings. Use a loopback static server for the full archive browser suite.

```powershell
node supabase/tests/run-local.cjs
node supabase/tests/intake.cjs
node supabase/tests/moderation.cjs
node --test supabase/tests/moderation-security.test.mjs supabase/tests/upload-security.test.mjs supabase/tests/cleanup.test.mjs
$env:AOMS_LOCAL_STORAGE_TEST='1'
node supabase/tests/storage-lifecycle-live.cjs
Remove-Item Env:AOMS_LOCAL_STORAGE_TEST
Get-Content -Raw -Encoding UTF8 supabase/tests/expiry-rollover-local.sql | docker exec -i supabase_db_aoms-local psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -q
node tests/submissions-browser.cjs
node tests/moderation-browser.cjs
python tools/validate_archive.py --check-files
```

Milestone counts: 45 foundation SQL checks, 46 intake DB checks, 46 moderation DB checks, 85 security/cleanup unit tests, 26 submission browser checks, and 29 moderation browser checks. Archive validation, 15 Python tests, Event Galleries 2.0 smoke, Cinematic Home smoke, 348 cinematic Chromium checks and full browser regression passed. The full regression covered all 115 event pages, 121 Gallery records, 20 original videos, and 60 responsive layouts. Deno type-check passed for both functions. Local security advisors reported no warnings or errors. A targeted tracked-source scan found no embedded JWT/service-key strings. Local before/after digests and the final SHA-256 read-back verified all four existing submissions, the two private objects, one moderator, verified MFA and the moderation ledger remained intact. The original Docker volumes were preserved.

## Evidence and remaining gates

- **Real local services.** An exact 50 MiB synthetic PNG was uploaded through signed TUS, resumed from the saved offset, and downloaded with a matching digest. Storage rejected 50 MiB + 1, enforced path scope, denied overwrite requests even when upsert was requested, and admitted one of two simultaneous writers to a disposable path. Anonymous object, submission-row and moderator-list reads were denied. The exact disposable object was deleted and checked absent through Storage; the original object inventory matched its starting snapshot. The independent PostgreSQL rollover test preserved a prior receipt and fenced the expired batch, then rolled back. Earlier owner verification covers real MFA, private preview, edit, approval, rejection and audit attribution.
- **Isolated and mocked tests.** Browser coverage exercises network failure, lost receipt, fresh challenge rollover and cancellation during authorization. It is mocked at Turnstile, gateway and TUS for those tests. Database fixtures cover quotas, batch scope, expiry/replay, verification lease, stale writes, conditional abandoned/rejected cleanup and refusal to release unclaimed reservations. Cleanup HTTP failure tests retain reservations. Direct local Storage integration and isolated database fixtures validate separate parts of the workflow.
- **Outstanding live coverage.** A fresh human Turnstile run, wall-clock token expiry, sustained resource load, and a deployed scheduler run across late-token/retention windows remain unverified. Local Chromium cancellation and simulator-driven rollover with real Storage passed in Milestone 5. The 250 MiB reservation cap bounds admitted objects, while repeated/partial transfers and bandwidth still need monitoring and operational limits. Establish capacity alerts, rate/abuse controls, cleanup health alerts, project availability alerts, and an owner-tested Auth recovery procedure before release. The local logging sidecar is not a production monitoring substitute.
- **Publication and removals.** Approval only sets private review status. The code has no production publication writer. Design a separate operator-reviewed normalization step to strip embedded location/metadata and convert media, then publish only eligible media through reviewable GitHub PRs. Require a durable public commit/media mapping and current approval when reconciling. A verified removal needs a tested intake/reporting path, reconciliation record, revocation and cache strategy, and a durable guard against republication from stale references. Rejected/removed media remain private under the current workflow. The future publisher and removal flow are open gates.
- **Privacy, consent and retention.** Confirm consent wording and owner handling responsibilities, retention and backup policy, report response times, identifier minimization, appropriate access for unpublished originals, and an incident contact. Dry-run scheduling and monitor remaining reservations. Preserve the audit ledger through any recovery. Browser code reads only public configuration and moderator session credentials scoped to Auth. Service keys remain server-side. The checked-in feature switches stay off.

**Recommendation.** Review the closed-intake rollout package now. Hold deployment until the remaining human challenge, elapsed-time, sustained load, and scheduled cleanup checks, preservation and recovery steps, and explicit owner approval are in place. Treat publication and public intake as later release decisions.
