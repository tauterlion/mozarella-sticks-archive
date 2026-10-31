# Local staging — 2026-10-31

Isolated stack `aoms-local` runs in Docker Desktop / WSL 2. Its workspace is the sibling `work/aoms-local`, outside this repository and excluded from Git. It is not linked to the production project. All three migrations applied successfully, with 112 event and 37 person validation-cache entries.

- Form: http://localhost:8766/submit.html
- Supabase API / Storage: http://localhost:54321
- Edge Function: http://localhost:54321/functions/v1/community-submit
- Studio: http://localhost:54323
- PostgreSQL: localhost:54322

The loopback-only form server overrides the submission configuration in memory. Production configuration remains disabled. The separate development sitekey is stored outside the repository. Put only its development secret in `work/aoms-local/edge.env`; never commit or print that file. Restart the local function server after saving the secret. Production credentials are not used locally.

`SUBMISSIONS_STORAGE_PUBLIC_URL` is an operator-only optional setting for the browser-facing Storage URL. Locally it is `http://localhost:54321`, since the Docker-internal Supabase hostname is inaccessible to the browser. Without this setting, the backend retains the original production URL behavior. This change is not deployed to production.

Results: 45 SQL security checks passed on real local PostgreSQL and ended with ROLLBACK. Zero submissions/objects remain; bucket private; local intake false. All five upload actions return 503 intake_disabled, and the function rejects an unapproved Origin with 403. Deno type-check passed.

The local gateway originally overwrote Functions CORS headers with `*`. The Functions service's `cors` plugin was removed from the isolated Kong declarative configuration, retaining the request-transformer and all other service configuration. After `kong reload`, all nine strict closed-intake HTTP checks passed without weakening assertions. This local adjustment may need reapplication if Supabase regenerates the gateway configuration.

The owner saved the development secret outside the repository, in the ignore-all local workspace. The function server was restarted without printing the secret. Local intake was then enabled for the authorized integration tests. A deliberately invalid token returned HTTP 400 `captcha_failed`, leaving zero batches, submissions and objects. A successful real challenge still requires the owner to complete Turnstile in the browser. Signed-token/TUS, interrupted transfer and cleanup tests remain pending until that step. Production intake remains disabled; no production deployment or merge was performed.

Follow-up: the owner's real browser challenge succeeded server-side and created local batches/upload records. Transfer then failed because the backend returned the ordinary TUS endpoint rather than `/storage/v1/upload/resumable/sign`. The installed Storage implementation's signed-upload tests confirm the required suffix. This was corrected, and a direct local signed TUS test passed creation, binary transfer, exact-byte authenticated download, and denial of public download. Its synthetic diagnostic object was removed through the Storage API. The user-created records remain for retry/diagnosis; none had reached pending review at this check. The form now reports status beside Send as well as beside each file. All 23 browser regressions passed again. A full user-browser retry through finalization remains pending, as do interruption, quota and cleanup lifecycle integration tests. The corrected backend has only been restarted locally, not redeployed to production.

Successful browser retry confirmed: the owner received an anonymous receipt after completing the real localhost Turnstile challenge. A read-only database check against that receipt confirmed `pending`, matching claimed/verified size and MIME, a stored SHA-256, a finalization timestamp, and the corresponding Storage object. The bucket remains private. This verifies the real local challenge → batch → signed TUS transfer → server validation → pending receipt path. It does not approve or publish the file. Interrupted transfers, quota/abuse and cleanup lifecycle integration coverage remain outstanding.
