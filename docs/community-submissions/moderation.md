# Milestone 3: moderator authentication and private review

## Implemented scope (2026-11-01)

Branch-only first slice: `tools/submission-review.html`, a disabled public configuration, a dedicated `community-review` Edge Function, and additive migration `20261101215947_moderator_read_access.sql`. Not deployed to production or the persistent Docker stack. Tested with isolated database fixtures and mocked browser/API dependencies; real Auth/MFA and Storage preview integration is still required.

The page supports email/password login, TOTP authenticator enrollment/verification, sign-out, newest-first status queues with 25-item pages and pending counts, plain-text metadata, and on-demand one-minute private previews. No signup UI. Sessions and private data stay in memory. Refreshing the page requires sign-in again. No contributor data is embedded in static HTML.

**Read-only:** editing, approve/reject, audit attribution for edits, idempotent mutations/conflict handling, and removal are not implemented yet. Approval will only change review state; GitHub publication is Milestone 4. Existing archive pages and intake are unaffected.

## Authorization boundaries

1. Browser signs in through Supabase Auth using only a public publishable key. Password and authenticator code go directly to Auth; no service key, credentials, or tokens in Git/config URLs/logs.
2. On every protected request the Edge Function sends the bearer token to Auth `/user` for signature/expiry/user validation. Only after success does it inspect the same token's subject, authenticated role, `aal2` and `session_id`. User-editable metadata is never authorization.
3. A service-only read RPC checks the exact user UUID against the operator-controlled singleton moderator allowlist, active flag, and a live `auth.sessions` record with matching user, `aal2`, and unexpired `not_after`. Deleted/signed-out sessions and deactivated moderators fail closed even before JWT expiry.
4. Browser roles retain zero table and RPC access. `submission_review_read` is SECURITY INVOKER. The one narrow SECURITY DEFINER helper is in `aoms_private`, has empty search_path, static schema-qualified SQL, and returns only a boolean. This is necessary to inspect Auth session existence without granting the backend broad SELECT access to auth.sessions. PUBLIC/anon/authenticated execution is explicitly revoked. No new RLS policies, data deletions, bucket changes or intake switches.
5. Preview signing happens only after this check, for a server-selected, unpurged object path. The response is not cached; the signed URL lasts 60 seconds. Anyone possessing that URL can use it during that window; logout cannot revoke an already issued URL or erase bytes already downloaded. The page clears previews after one minute and on sign-out. Large/long videos may need preview reload; proxy/range delivery remains a future option.

Exact-origin CORS is additional protection, not authentication. Moderator access works while public intake is disabled. No moderation endpoint can publish or change the intake switch.

## Alejandro account setup (owner action; do not send credentials)

The owner chose email/password plus an authenticator app and has no AoMS Auth user yet. The Supabase dashboard account is separate.

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

Before deployment, inspect advisors and test actual Auth/MFA/session revocation and signed previews, then recheck preservation counts. The migration is additive: it creates two functions only; rollback of this code requires no submission or Storage deletion. Keep the review config disabled and revert the Edge Function/page if needed, leaving the unused functions intact pending a reviewed forward fix.

References: [Auth getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [session revocation](https://supabase.com/docs/guides/auth/sessions), [MFA](https://supabase.com/docs/guides/auth/auth-mfa).

Existing regression rerun November 1: 45 foundation SQL checks, 25 intake DB checks, 37 upload tests, 23 submission browser checks, 15 Python tests, nine live production closed-intake checks, and archive validator passed. Full browser regression passed on rerun: 112 event pages, 121 available Gallery records, 20 video playback checks, Media Manager guards and 60 responsive/theme layouts. The first run timed out on one event page; an isolated check and complete rerun passed without archive code changes. Original people/timeline/media manifests and assets have no diff against main. Production read-only snapshot confirmed intake false, bucket private and zero submissions/objects/moderators.
