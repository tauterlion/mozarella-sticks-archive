# Community Submissions — implementation and release gates

Work branch: `feat/community-submissions-foundation`. Nothing is merged to main.

## Current state (2026-10-30)

The private database foundation and the explicitly approved `secure_submission_intake` migration are applied. Hosted migration version: `20261030232342`. The migration file was renamed to match that history without changing its SQL. The `community-submit` Edge Function is deployed as version 1, with public intake still disabled. The owner approved the migration after reviewing its SQL; the earlier declined confirmation is resolved.

Public intake remains disabled in both the hosted database and `data/submissions-config.json`. The Gallery has no submission link. The new page can be reviewed locally, including file selection and metadata, without contacting Cloudflare or Supabase while disabled.

Original `data/people.json`, `data/timeline.json`, `data/media.json`, assets, routes and existing features are unchanged. The private event-validation cache had mojibake in its original era seed; the new migration refreshes those cache strings from the unchanged canonical timeline. Historical JSON is not edited.

## Implemented

- `submit.html`: multiple local image/video previews, per-file captions, all canonical events/people, event proposals, explicit no-people choice, apply-details-to-all, consent, anonymous receipts, progress and retries. No name/email/account field.
- `scripts/submissions.js`: sequential transfers to limit mobile bandwidth; resumable TUS chunks of 6 MiB; browser capabilities kept in memory, not localStorage. Reloading loses the private upload session. Interrupted transfers can be retried while the page remains open. File controls lock on first authorization, preventing retry metadata from drifting.
- `supabase/functions/community-submit`: strict request allowlist; server-side Turnstile success/hostname/action/five-minute checks; exact-origin CORS; hashed batch capability; private, path-scoped signed upload token without upsert; server download, bounded size, structural content checks and SHA-256 before pending status. No approval, preview, listing or publishing route.
- `submission_intake`: service-only invoker RPC; public/authenticated execution revoked. Canonical IDs and record constraints remain enforced in PostgreSQL. Global durable throttle (60 requests/minute, 10 batches/hour), 2-hour batches, maximum three authorized in-flight files per batch, one validation lease across workers, 250 MiB reserved budget. Every issued path reserves the full 50 MiB bucket maximum, regardless of claimed file size.
- Private failed/cancelled uploads retain their reservation. Cleanup claims prevent restoration while deletion is in progress. The trusted cleanup worker deletes through the Storage API and verifies absence before marking capacity released. No direct writes to `storage.objects`.
- Vendored `tus-js-client` 4.3.1 with MIT license, pinned development tools and lockfile. No frontend build system or framework.

## Security decisions and limits

CORS is defense in depth, not authentication. CAPTCHA is verified before creating a batch; every other action needs the unguessable batch capability. The service key is read only from server environment variables. Browser requests cannot choose paths, status, reviewer, publication fields, or database hashes.

No IP headers are trusted or stored by application code. Global throttles are deliberately conservative; an attacker can cause temporary denial of service by exhausting them. Before release, verify trusted ingress controls and budget alerts. Do not substitute arbitrary `X-Forwarded-For` values for trustworthy rate-limit identities.

The uploader necessarily receives its own opaque storage path as part of the signed **write** capability required by TUS. It never receives a signed read URL, other paths, a listing, or another submission's metadata. This is the narrowly scoped transport exception to the spec's internal-path guidance.

Signed tokens last up to two hours and TUS upload URLs can last 24 hours. Reissuing a token near batch expiry means cleanup must wait until **batch expiry + 26 hours**, as well as the configured retention period. Early deletion could allow a still-valid token to recreate an object after its reservation was released. Cleanup is not scheduled yet. Its Storage deletion/absence behavior needs hosted testing.

Structural checks are not full media decoding, malware detection or content moderation. All five formats are inspected; animated WebP/APNG and malformed containers are rejected. Supported MP4 visual sample entries are AVC, HEVC, VP9 and AV1. Some valid but unusual encodings may require conversion. Never publish originals directly: the later publishing worker must fully decode/normalize, remove GPS and unnecessary metadata, and revalidate after moderator approval. Heavy video conversion does not belong in the constrained Edge runtime.

No lifetime file-count limit is imposed in the picker, but capacity is finite. The current form asks the visitor to reload and choose only unfinished files after a 2-hour session expires. Automatic challenge renewal and queue rollover remain unfinished; do not advertise seamless unattended multi-hour queues.

## Verification

Run from repository root after `npm ci --prefix supabase/tooling`:

```text
node supabase/tests/run-local.cjs
node supabase/tests/intake.cjs
node --test supabase/tests/upload-security.test.mjs
node supabase/tests/closed-intake.mjs
supabase/tooling/node_modules/.bin/deno check supabase/functions/community-submit/index.ts
python tools/validate_archive.py --check-files
python -m unittest discover -s tests -p "test_*.py"
node tests/submissions-browser.cjs
node tests/browser-regression.cjs
```

The browser suites use `PLAYWRIGHT_MODULE` and `CHROME_BIN` when the runtime is not on the default path. The archive suite expects the site served on `http://127.0.0.1:8765/` (or `BASE_URL`). The submission suite starts its own temporary local server. Browser transfer tests explicitly mock Turnstile, the gateway and TUS; production configuration stays disabled. Real browser-encoded JPEG/PNG/WebP, browser-recorded WebM, and an original MP4 exercise the structural parser locally.

Local results: 45 foundation SQL checks, 25 intake database checks, 32 request/stream/file tests, 23 submission browser checks, all 15 existing Python tests, and the existing full archive browser regression passed. The archive validator reports zero errors/warnings. Full regression includes 112 event pages, all filters, all 20 original video playback checks, Media Manager preservation/unsaved-change guards, diagnostics and 60 responsive/theme layouts. Deno type-check passed. Security tests use isolated PostgreSQL-compatible PGlite and roll back fixtures.

After migration, all 45 hosted rollback-only security checks passed again. The new service-only RPC correctly rejects intake while disabled; anon/authenticated roles cannot execute it. Nine real HTTP closed-intake checks passed against the deployed function. Positive upload/CAPTCHA/transfer tests remain local/mocked, not hosted. The earlier foundation rollback verification is recorded in `rollback-verification.md`; current deployment evidence is in `deployment-verification.md`.

Screenshots are generated outside the repository under `outputs/community-submissions/`: dark/light desktop/mobile. They show the actual 112-event/37-person selectors with synthetic local upload previews, not publicly uploaded media.

## Deployment and remaining gates

1. Completed: approved migration applied, filename reconciled to hosted history, hosted SQL security checks/advisors rerun. Do not modify already-applied migrations.
2. Completed: `community-submit` deployed using the checked-in config (`verify_jwt=false` only for this intentionally anonymous, application-authenticated endpoint). Database switch remains false; live closed-intake rejection verified.
3. Configure the production Turnstile widget for `tauterlion.github.io`. Supply only the public sitekey to the static config; store the secret as `TURNSTILE_SECRET_KEY` in Edge secrets. Defaults: `SUBMISSIONS_ORIGIN=https://tauterlion.github.io`, `TURNSTILE_HOSTNAME=tauterlion.github.io`; Supabase injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. No secrets in Git or chat.
4. Use an isolated staging project for positive hosted tests while production remains off: genuine CAPTCHA/replay/expiry; signed-token TUS compatibility; overwrite/cross-path attempts; real 50 MiB and oversize files; interruption/cancel/retry; quota/concurrency; memory/CPU/egress; late-token cleanup and deletion confirmation; anonymous read/list/preview denial. Establish automated cleanup, capacity alarms and operator monitoring.
5. Finish automatic queue rollover and the remaining cancellation race/long-queue browser tests. A cancelled transfer remains private and reserved until cleanup, but live TUS cancellation behavior is not yet proven.
6. Complete Alejandro-only authentication/moderation, signed private previews, verified takedown intake, metadata normalization and the explicit GitHub PR publishing/reconciliation pipeline. Operator-managed moderator enrollment is still required. Approval alone must never mark an item published.
7. Complete privacy/consent review, retention/incident runbook and all release acceptance tests. GitHub Pages cannot serve Git LFS objects; the proposed public derivative limit is 25 MiB even though private intake allows 50 MiB. Larger accepted files require processing/hold, not automatic git publication.
8. Only after all gates pass, request release approval before merging. Then enable the database switch and static config and add the Gallery CTA. No friends-only beta is required.

To stop intake later, an operator sets `public.submission_settings.intake_enabled=false`; the backend role cannot change this switch. Disable the static configuration/CTA too. Already-issued write tokens cannot be individually revoked by this code and may finish transferring into the private bucket, but disabled intake prevents new authorizations and finalization. Retain reservations until the safe cleanup horizon. No public data or history needs to be rolled back.

References: [Supabase signed uploads](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl), [resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads), [Turnstile server verification](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
