# Milestone 3: moderator authentication and private review

## Implemented scope (2026-11-02)

Local implementation: `tools/submission-review.html`, a disabled public configuration, a dedicated `community-review` Edge Function, read-access migration `20261101215947_moderator_read_access.sql`, and controls migration `20261102111947_moderator_controls.sql`. Installed in the isolated Docker stack for live authentication tests; not deployed to production. Real local Auth/MFA testing now passes. Real Storage preview integration remains to be verified with the moderation workflow.

The page supports email/password login, TOTP authenticator enrollment/verification, sign-out, newest-first status queues with 25-item pages and pending counts, plain-text metadata, and on-demand one-minute private previews. No signup UI. Sessions and private data stay in memory. Refreshing the page requires sign-in again. No contributor data is embedded in static HTML.

**Local controls implemented:** edit pending captions, event/proposal metadata and canonical people tags; approve pending items; reject pending or approved items. Every write verifies MFA/session/allowlist, checks the expected record version, and records an immutable moderator action. Approval only changes review state; GitHub publication and removal are separate later work. Existing archive pages and intake are unaffected.

## Authorization boundaries

1. Browser signs in through Supabase Auth using only a public publishable key. Password and authenticator code go directly to Auth; no service key, credentials, or tokens in Git/config URLs/logs.
2. On every protected request the Edge Function sends the bearer token to Auth `/user` for signature/expiry/user validation. Only after success does it inspect the same token's subject, authenticated role, `aal2` and `session_id`. User-editable metadata is never authorization.
3. A service-only read RPC checks the exact user UUID against the operator-controlled singleton moderator allowlist, active flag, and a live `auth.sessions` record with matching user, `aal2`, and unexpired `not_after`. Deleted/signed-out sessions and deactivated moderators fail closed even before JWT expiry.
4. Browser roles retain zero table and RPC access. `submission_review_read` is SECURITY INVOKER. The one narrow SECURITY DEFINER helper is in `aoms_private`, has empty search_path, static schema-qualified SQL, and returns only a boolean. This is necessary to inspect Auth session existence without granting the backend broad SELECT access to auth.sessions. PUBLIC/anon/authenticated execution is explicitly revoked. No new RLS policies, data deletions, bucket changes or intake switches.
5. Preview signing happens only after this check, for a server-selected, unpurged object path. The response is not cached; the signed URL lasts 60 seconds. Anyone possessing that URL can use it during that window; logout cannot revoke an already issued URL or erase bytes already downloaded. The page clears previews after one minute and on sign-out. Large/long videos may need preview reload; proxy/range delivery remains a future option.

Exact-origin CORS is additional protection, not authentication. Moderator access works while public intake is disabled. No moderation endpoint can publish or change the intake switch.

## Alejandro account setup (owner action; do not send credentials)

The owner chose email/password plus an authenticator app. Disposable local Auth tests passed; personal local enrollment and authenticator setup are complete, confirmed by the owner reaching the private queue. The Supabase dashboard account is separate.

1. First test with a disposable user in local Studio, not production. The new local migration/function and a local-only enabled moderation config must be installed before that test; keep committed config disabled. Use the same separate local project and origin as the intake tests.
2. Before production enrollment, disable new-user signup and anonymous sign-ins in the AoMS project's Auth settings. Confirm email/password and TOTP support. Set recovery/redirect URLs deliberately; a password recovery UI and tested recovery procedure are still launch gates.
3. Through the trusted Auth administration interface, create/invite only Alejandro's dedicated account. He sets a unique password privately. Do not use someone else's account or self-enroll based on an email string.
4. Verify the account belongs to Alejandro, then an operator inserts its **exact Auth user UUID** into `submission_moderators` (singleton prevents a second moderator). No backend/browser enrollment route exists. Never use an automatic `on conflict` replacement: review an existing enrollment before changing it.
5. Enable only the appropriate review config after local tests/deployment: Supabase URL, public publishable key, and community-review endpoint. This does not enable visitor intake. First sign-in displays authenticator setup, then requires a current six-digit code. Scan privately; do not share the QR code/secret or screenshots of it.
6. Verify the real account, a non-moderator account, password-only session, expired session, and sign-out revocation. Confirm private previews work and public/anonymous reads fail. Do not consider mocked tests a replacement.

Emergency moderator lockout: an operator sets `submission_moderators.active=false` and revokes the affected Auth sessions. Keep intake off. For a lost authenticator, verify Alejandro's identity through the trusted operator process before removing/replacing factors; never disable the server's MFA requirement as a shortcut. A tested owner recovery procedure is required before launch.

## Verification

```powershell
node supabase/tests/moderation.cjs
node --test supabase/tests/moderation-security.test.mjs
& ./supabase/tooling/node_modules/.bin/deno.cmd check supabase/functions/community-review/index.ts
node tests/moderation-browser.cjs
```

Browser runtime variables are documented in operations.md. Screenshots use synthetic captions/media only and are saved outside Git at `../outputs/community-moderation`. Database tests use PGlite fixtures ending in ROLLBACK. No production enrollment/migration/deployment occurs through these tests.

Verification on November 1: 24 gateway security tests, 22 database checks and 17 mocked browser checks passed, including both themes and mobile/desktop. Deno type-check passed. The new migration also passed a real local PostgreSQL rollback-only check: both browser roles denied, service execution permitted, unknown identity denied; ROLLBACK removed both new functions and preserved all three existing local submissions and the private bucket.

Before production deployment, test signed previews and the full moderation workflow, then recheck preservation counts. Live local Auth/MFA/session-revocation tests and local security advisors now pass. The migration is additive: it creates two functions only; rollback of this code requires no submission or Storage deletion. Keep the review config disabled and revert the Edge Function/page if needed, leaving the unused functions intact pending a reviewed forward fix.

References: [Auth getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [session revocation](https://supabase.com/docs/guides/auth/sessions), [MFA](https://supabase.com/docs/guides/auth/auth-mfa).

Existing regression rerun November 1: 45 foundation SQL checks, 25 intake DB checks, 37 upload tests, 23 submission browser checks, 15 Python tests, nine live production closed-intake checks, and archive validator passed. Full browser regression passed on rerun: 112 event pages, 121 available Gallery records, 20 video playback checks, Media Manager guards and 60 responsive/theme layouts. The first run timed out on one event page; an isolated check and complete rerun passed without archive code changes. Original people/timeline/media manifests and assets have no diff against main. Production read-only snapshot confirmed intake false, bucket private and zero submissions/objects/moderators.

## Phase 1 live verification — November 1

The read-access migration was installed only in local PostgreSQL, without resetting the database. Both local functions are served from the copied branch code. Local Auth has global `enable_signup=false`, anonymous sign-in disabled, password minimum 12, and TOTP enrollment/verification enabled. Keep `[auth.email].enable_signup=true`: the CLI maps that setting to email provider availability; disabling it also breaks password login even for operator-created accounts. The global Auth signup switch still rejects public signup.

The local form server overrides moderation config in memory with the local URL and public publishable key. The committed moderation config remains disabled and contains no credentials. The SDK's QR response is a data URL, so the UI removes its prefix before creating the SVG image blob; this fixes real authenticator setup rendering.

21 live local Auth/browser checks passed: incorrect/correct password, password-only denial, real QR rendering, wrong/correct TOTP, returning-user MFA, anonymous/forged/expired token denial, live allowlist deactivation, non-moderator AAL2 denial, direct table denial, logout revocation, database session expiry and UI clearing, and disabled self-signup. Disposable accounts and allowlist entries were removed; all three pre-existing local submissions, Storage objects and intake setting remained unchanged. No human password, QR secret or verification code was read or recorded. The automated test generates credentials only for its own disposable users.

Run this opt-in test **before personal enrollment**, or in another isolated local stack with an empty moderator allowlist:

```powershell
$env:AOMS_LOCAL_AUTH_TEST='1'
node supabase/tests/moderation-live.cjs
Remove-Item Env:AOMS_LOCAL_AUTH_TEST
```

It uses the existing browser runtime variables, local `work/aoms-local/status.json`, and the explicitly named Docker database. It refuses nonlocal API configuration or an occupied moderator allowlist. It never replaces an existing moderator. Local-only signed expiry fixtures use the development signing key in memory; these are test fixtures, not an authentication bypass in the application.

22 isolated DB checks, 24 gateway tests and Deno checks also passed. `supabase db advisors --local --type security --level warn` reported no issues. Account creation in local Studio and explicit owner confirmation of its UUID are the next enrollment gate. Production enrollment/deployment and recovery procedures remain outstanding; no account is auto-enrolled by email.

## Phase 2 controls and Phase 3 verification — November 2

Owner enrollment completed privately; no password, QR secret or TOTP code was requested. The controls migration is installed **only locally**. It creates one deny-all RLS action table, a service-only SECURITY INVOKER write RPC, and replaces the existing read RPC to add history/rejection notes. It does not delete data, change Storage policies or enable intake. Pre/post installation checks confirmed original submission rows, objects and moderator enrollment unchanged.

`submission_moderation_actions` is both the immutable moderator audit and retry ledger. Each action records actor UUID, request UUID, submission, validated request, result/version and timestamp. Backend access is SELECT/INSERT only; no browser grants/policies. The existing generic audit trigger continues to record row changes. The action ledger supplies explicit actor attribution for metadata edits without changing the generic trigger or rewriting older audit records.

Writes lock the target row and compare its version. A stale write returns HTTP 409 and preserves the browser draft. The same request UUID and payload returns the original result without applying twice; reusing an ID for different input is rejected. Edits are limited to pending items. Approving a proposal requires mapping it to a canonical event first; no timeline event is created here. Approvals cannot set publication mappings. Rejected/approved/published metadata cannot be edited through this interface. Rejecting does not immediately delete objects or release reservations; retention cleanup is separate.

The UI provides unsaved-change warnings, save-before-decision guards, explicit approve/reject confirmations, optional internal rejection reasons, and the latest 100 moderator actions. It uses the full 112-event/37-person selectors and renders captions/reasons as plain text. Retrying a failed save reuses its operation ID. The garbled queue separator was corrected only in interface code; historical/submitted captions were not rewritten.

Tests completed: 46 isolated moderation database checks, 39 gateway security tests, 27 mocked browser checks covering edit/retry/conflict/approve/reject/history plus mobile/light/dark layouts. A real local PostgreSQL transaction exercised edit, retry, stale conflict, approve, reject and actor audit, then ended with ROLLBACK; its temporary fixture and sequence changes were rolled back. Local security advisors reported no WARN/ERROR findings. Existing 45 foundation checks, 25 intake DB checks, 37 upload security tests, 23 submission browser checks, 15 Python tests, archive validator and nine production closed-intake checks passed.

A separate retained local fixture, captioned **AoMS disposable moderation test - do not publish**, contains a synthetic gold PNG. It is operator-created for the owner's signed-in end-to-end preview/edit/approve/reject check, not a CAPTCHA acceptance test. Existing submissions were not repurposed. The operator fixture uses private Storage and the same binary checks/finalization states. At this checkpoint the owner-browser check is pending; do not claim live HTTP write/preview completion from mocked tests or direct SQL tests alone.

Remaining before production: owner-browser end-to-end confirmation; controlled hosted migration/deployment and production account enrollment; password recovery verification; remaining intake abuse/interruption/quota/cleanup gates; publication/normalization and verified removals. No public Gallery publication route exists. Reopening a rejected item is not included in this slice.
