# Milestone 5 — operational reliability

Draft PR #18. This round exercised local Docker Storage and browser flows and prepared the cleanup scheduler for review. No hosted or owner-record cleanup was run.

## Browser transport and failure recovery

`tests/submissions-transport-live.cjs` uses Chromium, the real submission UI and browser TUS client, the shared intake handler, and real signed uploads and downloads against local Docker Storage. Its submission tables are isolated in PGlite, and it injects a fixture challenge provider, a dropped PATCH, a Storage verification response failure, and simulated elapsed time. It signs only generated disposable paths, removes only those paths through the local Storage API, and compares the original object inventory at teardown. Test-file payloads are synthetic PNGs.

Results:

- An exact 50 MiB upload resumed at its saved offset after a dropped chunk. The handler produced the original SHA-256. After the simulated Storage read outage, the browser retried verification without another transfer or signature. Before the fix, requesting a fresh signature for an already stored file could fail permanently.
- Cancelling while a live TUS upload entered its second chunk changed the disposable record to failed without finalization. The UI drops late progress events after cancellation.
- Refresh during a transfer showed the native leave warning. Accepting it cleared the queue, left the old reservation abandoned, and kept capability and TUS state out of browser storage. Keep the original tab open until you receive the receipt. If an incomplete tab is closed or refreshed, the prior private request cannot be recovered from the new page.
- With a simulated expired batch and renewed fixture challenge, the real browser and Storage path rolled into a new batch and finalized exactly once. Receipt reconciliation before rollover also remains covered by mocked browser and local PostgreSQL tests.
- The fixture expiry callback cleared the stale challenge and initiated renewal. A genuine human Turnstile expiry check remains open unless separately recorded. Challenge tokens have a five-minute validity window per [Cloudflare](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

To test the real widget locally, open `http://localhost:8766/submit.html`, fill the required fields and consent for a harmless file, and complete Turnstile. Leave **Send for review** untouched. Keep the page open at least five minutes, verify the widget refreshes, and confirm that completing the renewed challenge makes Send available again. This check creates no uploads or database rows. A genuine end-to-end renewal through Siteverify and an elapsed two-hour batch window are separate disposable-staging tests.

Run the browser harness with `AOMS_BROWSER_STORAGE_TEST=1` plus the existing `PLAYWRIGHT_MODULE` and `CHROME_BIN` settings. Invoke `node tests/submissions-transport-live.cjs` from the repository root. Unset the opt-in afterward. The harness requires the local Docker API on port 54321 and refuses nonlocal configuration.

### Turnstile expiry follow-up

A genuine local browser observation showed the expiry message after about ten minutes while the widget still appeared successful. The old callback path cleared its saved token, but the success callback did not clear the previous expiry message. That observation established expiry notification, while leaving automatic renewal unconfirmed.

The UI now gives the challenge its own status and an accessible **Refresh security check** button. Cloudflare may renew automatically. The fallback resets the widget without touching the queued files or metadata. Token use is gated by provider expiry, a conservative 295-second client deadline, and a second check immediately before the batch request. Server-side Siteverify still rejects expired or invalid tokens. A valid new callback replaces the old warning with **Security check complete**.

Fresh Chromium loaded the actual provider and observed the manual reset call return with no intake requests. An independent simulated-clock Chromium test advanced past expiry without the provider callback, verified no batch creation, then refreshed and confirmed the queue was preserved. The live 50 MiB transport and mocked browser suites were rerun. Full elapsed-time automatic renewal of the corrected build still needs a human observation. Existing tabs keep their in-memory file queues and their already loaded code. Leave such tabs open until ready to move the draft manually.

## Retention worker

`20261120005042_submission_cleanup_leases` adds a service-only report/claim/complete RPC. It shares the intake transaction lock and locks eligible rows before claiming. A claim advances at most 200 expired open batches and removes at most 500 expired rate windows per run. It claims up to 10 exact-path objects for 10 minutes. A batch enters cleanup eligibility only after expiry plus 26 hours and the applicable abandoned or rejected retention period. Pending, approved, and published records are outside the cleanup set. Batches and submission/audit records are preserved, including cancelled and purged submissions. The older unleased cleanup path cannot update purge markers.

The worker deletes only the exact generated `incoming/<batch>/<submission>` path. Before release, it requires a successful Storage absence check, the matching active lease, and no exact object metadata row in PostgreSQL. Deletion failures, unconfirmed results, and a crashed worker leave the reservation intact. An expired lease can be reclaimed. A delayed previous run can only attempt the same now-retired path and cannot acknowledge the newer lease. Custody and status guards keep the claimed path from being restored for another submission.

Tests cover report-only reads, rate-window pruning, late-token and rejected retention boundaries, concurrent claim exclusion, provider failure, unconfirmed completion, and retry across a simulated lease expiry. The browser fixture worker skipped a real disposable object at simulated expiry +25 hours, failed safely after +28 hours, then deleted it through real local Storage after lease expiry. Pending fixtures and their audit rows remained. The new schema and service-only report also executed inside a real local PostgreSQL transaction and rolled back. No claim or delete ran against that database's original owner rows. Real elapsed token, retention, and timer windows remain to be observed in a disposable staging setup, including partial TUS data that Storage manages separately.

## Scheduling proposal and operating limits

`node supabase/tooling/cleanup.mjs --report` is the default work mode and makes an aggregate DB read. The CLI validates the exact approved target URL and refuses `--apply` against the owner local stack. A future authorized hosted apply requires `--apply`, `AOMS_CLEANUP_TARGET=kvyrbtooynofijdtmqup`, and the separate matching `AOMS_CLEANUP_APPLY_PROJECT`. Keep service credentials in the trusted scheduler's environment and outside the repo. Do not run or enable the apply job under this milestone.

Prepare a trusted run-once job with a 15-minute interval, single instance, and an eight-minute job timeout. On systemd use a `Type=oneshot` service, a private `EnvironmentFile`, `TimeoutStartSec=480`, and a timer with `OnCalendar=*:0/15` and `Persistent=true`. Start with `ExecStart=/usr/bin/node /srv/aoms/supabase/tooling/cleanup.mjs --report` in the staged deployment. A future reviewed change would set the explicit apply flags. Record sanitized JSON counts, a heartbeat, and outcome. Treat a nonzero worker exit, no heartbeat after two intervals, a stalled lease, or a reservation ratio at or above 80% as operator alerts. Route alerts privately and test the alert channel before enabling deletion. Never log signed URLs, captions or IDs. Report mode and alerts were exercised; no persistent schedule or real alert delivery was enabled.

| Measure | Verified local evidence or configured bound |
| --- | --- |
| Slow/faulted 50 MiB browser upload | 5.93 seconds, effective 8.43 MiB/s, 10 PATCH attempts with injected 300 ms chunk delays, one dropped PATCH, and one verification retry. This is a loopback measurement. |
| Docker Storage samples | Approximately 94–178 MiB memory and peak sampled CPU 43% during that run. Network counter rose about 53 MB inbound. Block I/O was unchanged at sampled points during this single run. These are snapshots, not worst-case or Edge metrics. |
| Bounded malformed burst | 65 harness requests in 98 ms. 34 returned 400 and 31 returned 429 after earlier fixture traffic used part of the same 60-request window. This was a synthetic test against the local harness. |
| Intake bounds | 50 MiB per file, 250 MiB accounted reservation budget, three in-flight files per batch, 10 new batches per hour, 60 gate calls per minute, one validation lease. The existing local owner rows account for 200 MiB of reservations. |
| Cleanup bounds | 10 objects per run, 10-minute claims, 15-minute proposed interval. Each object must pass exact deletion and DB confirmation before freeing storage. |

The reservation budget bounds admitted objects. It does not measure backend temporary TUS parts or cap their bandwidth. Benchmark sustained CPU/memory, slow/intermittent traffic, API limits, temporary Storage bytes, cost, and scheduler/alert behavior before hosted rollout. Do not extrapolate Docker samples to hosted Edge limits. See [Supabase's partial upload cleanup guidance](https://supabase.com/kb/troubleshooting/storage-clean-up-partial-files-from-failed-or-aborted-uploads).

Controlled rollout should stay on hold until the human/widget and wall-clock checks, sustained load measurements, and monitored cleanup trial pass in isolated staging. Public release also retains the earlier publication, verified removal, privacy and recovery gates.
