# Isolated local staging

## Current state (2026-11-01)

Docker project `aoms-local` is independent of hosted project `kvyrbtooynofijdtmqup`; never link it to production. Workspace `../work/aoms-local` is outside this repository and has an ignore-all `.gitignore`. Its secrets, generated gateway config and CLI status output must not be committed or printed.

| Service | Local address |
|---|---|
| Form | http://localhost:8766/submit.html |
| API / Storage | http://localhost:54321 |
| Intake function | http://localhost:54321/functions/v1/community-submit |
| Studio | http://localhost:54323 |
| PostgreSQL | localhost:54322 |

Local intake was enabled for authorized tests and test submissions/objects remain. Production intake remains disabled. The three original migrations and 112-event/37-person cache are installed locally. Branch code includes the signed-TUS `/storage/v1/upload/resumable/sign` correction and Send-adjacent feedback; production v1 does not.

Verified October 31: real localhost Turnstile → batch → signed TUS transfer → server binary verification → pending receipt. A read-only lookup confirmed matching size/MIME, SHA-256, finalization timestamp and private object. No approval or publication occurred. A separate synthetic signed-TUS test confirmed exact bytes and denied public reads; that diagnostic object was removed via Storage API.

Earlier, 45 real PostgreSQL checks rolled back cleanly while the inbox was empty; nine closed HTTP checks passed with local intake off after the CORS fix. Those earlier empty/off observations are historical, not the current local state. Remaining live tests include interruption/cancellation, expiry, quota/concurrency, 50 MiB boundary and cleanup lifecycle.

## Start / resume the existing stack

Prerequisites: Docker Desktop running Linux containers, pinned tools installed (`npm ci --prefix supabase/tooling`), Python and the existing local workspace. Run from repository root. Do not reinitialize or reset the existing database.

```powershell
$localRoot = (Resolve-Path ../work/aoms-local).Path
& ./supabase/tooling/node_modules/.bin/supabase.cmd start --workdir $localRoot
# Copy only function code; preserve local config, data and edge.env:
Copy-Item supabase/functions/community-submit "$localRoot/supabase/functions/" -Recurse -Force
& ./supabase/tooling/node_modules/.bin/supabase.cmd functions serve community-submit --workdir $localRoot --env-file "$localRoot/edge.env"
# Another terminal, from repository root:
python ../work/aoms-local/serve-form.py
```

Use the existing server if its port is already listening; do not launch duplicates. Ctrl+C stops each foreground server. After code changes, stop the function server, copy the code again, and restart it. After secret changes only a restart is needed. `serve-form.py` serves this checkout and overrides the config in memory; it never changes the committed production config.

The ignored `edge.env` contains the following names. Enter the actual local secret privately; do not use the production secret:

```dotenv
SUBMISSIONS_ORIGIN=http://localhost:8766
TURNSTILE_HOSTNAME=localhost
SUBMISSIONS_STORAGE_PUBLIC_URL=http://localhost:54321
TURNSTILE_SECRET_KEY=<local widget secret>
```

`turnstile-sitekey.txt` contains the separate localhost public sitekey. The public Storage URL override bridges Docker's internal hostname to the browser; it is not a production setting. The CLI supplies local Supabase credentials.

## Gateway CORS after restart

The CLI-generated Kong Functions service may overwrite exact-origin headers with `*`. The tested local adjustment removes only its Functions CORS plugin, preserving every other service and request-transformer. Reapply if the config is regenerated:

```powershell
docker cp supabase_kong_aoms-local:/home/kong/kong.yml ../work/aoms-local/kong.yml
```

Privately edit that ignored file: inside service `functions-v1`, remove only the line `- name: cors` under its plugins. Do not remove CORS from other services, print the file, or alter embedded local credentials.

```powershell
docker cp ../work/aoms-local/kong.yml supabase_kong_aoms-local:/home/kong/kong.yml
docker exec supabase_kong_aoms-local kong reload
```

For the nine closed checks, first turn **local only** intake off using the explicitly named local container. Preserve records:

```powershell
docker exec supabase_db_aoms-local psql -U postgres -d postgres -c "update public.submission_settings set intake_enabled=false where singleton;"
$env:INTAKE_TEST_ENDPOINT='http://localhost:54321/functions/v1/community-submit'
$env:INTAKE_TEST_ORIGIN='http://localhost:8766'
node supabase/tests/closed-intake.mjs
Remove-Item Env:INTAKE_TEST_ENDPOINT, Env:INTAKE_TEST_ORIGIN
```

For authorized positive local tests, set the same local switch to true. Complete the real widget yourself in the browser. Never substitute a test widget or bypass in production. Do not run the empty-inbox SQL fixture against retained test submissions.

## Stop without deleting local data

Stop the form and function terminals with Ctrl+C, then:

```powershell
& ./supabase/tooling/node_modules/.bin/supabase.cmd stop --project-id aoms-local --workdir ../work/aoms-local
```

The CLI preserves local volumes by default. Never add `--no-backup`, run `db reset`, delete volumes, or use `--all` for routine stopping. If a server was started in the background, identify the process by its exact command/port before stopping only that process. Resume with the start sequence above; check private bucket and intake state rather than assuming defaults.

## Moderator authentication added locally — November 1

`community-review` and the additive read-access functions are now installed locally. The local-only form config also enables `http://localhost:8766/tools/submission-review.html`; committed production config stays disabled. `functions serve` serves both copied functions. Preserve both function directories when restarting.

Local `supabase/config.toml` changes required for the tested sign-in flow:

```toml
[auth]
enable_signup = false
enable_anonymous_sign_ins = false
minimum_password_length = 12
site_url = "http://localhost:8766"
additional_redirect_urls = []

[auth.email]
enable_signup = true

[auth.mfa.totp]
enroll_enabled = true
verify_enabled = true

[functions.community-review]
verify_jwt = false
```

Edit the existing sections, do not duplicate them or replace the rest of the config. The email section keeps the provider available; global signup remains disabled. Restart the stack with the data-preserving stop/start commands after Auth configuration changes, then reapply local Functions CORS and restart the function/form servers. Run those servers in separate terminals so stopping one does not stop both. Never print `status.json`, `edge.env` or generated `kong.yml`.

Live Auth tests use disposable accounts and leave existing submissions intact. See moderation.md for results and personal local enrollment steps. The new local read functions were installed directly for iteration; they are not in hosted migration history. Do not reset the stack to reconcile local history.
