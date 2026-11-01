# Deployment, verification and recovery

Run from the repository root in PowerShell. Commands are operator instructions, not evidence that deployment happened. Production intake must stay disabled. PR #18 is unmerged. See README.md for current deployment inventory.

## Verify a checkout

```powershell
npm ci --prefix supabase/tooling
node supabase/tests/run-local.cjs
node supabase/tests/intake.cjs
node --test supabase/tests/upload-security.test.mjs
& ./supabase/tooling/node_modules/.bin/deno.cmd check supabase/functions/community-submit/index.ts
python tools/validate_archive.py --check-files
python -m unittest discover -s tests -p "test_*.py"
node tests/submissions-browser.cjs
# Start in another terminal for the existing full archive suite:
python -m http.server 8765 --bind 127.0.0.1
# In the test terminal:
node tests/browser-regression.cjs
```

Set `PLAYWRIGHT_MODULE` to the installed Playwright module and `CHROME_BIN` to the Chrome executable when not on the default runtime paths. The archive browser suite also accepts `BASE_URL`. Submission browser tests start their own server and mock the network; they do not establish live security behavior.

Last completed baseline: 45 SQL security checks, 25 intake database checks, 37 request/file security tests, 23 submission browser checks, 15 Python tests, archive validator with zero errors/warnings, and full archive browser regression. These are dated October 30–31 results, not a claim that every later revision reran every suite.

## Production deployment (only after review)

1. Record the current function version and export its source using the Supabase dashboard/MCP `get_edge_function` to a private backup directory. Record the source commit and migration list. Never copy secrets into Git. Confirm intake false and bucket private; count submissions, batches and Storage objects before and after.
2. Inspect new SQL separately. The existing three migrations are already applied; do not rerun the foundation script against a populated inbox. Apply only explicitly reviewed new migrations through Supabase migrations tooling. Never use `db reset`, schema drops, or reverse foundation SQL on production.
3. Deploy exactly the intended function from a tested checkout. This is the intake command, not a moderation deployment command:

```powershell
& ./supabase/tooling/node_modules/.bin/supabase.cmd functions deploy community-submit --project-ref kvyrbtooynofijdtmqup --use-api --no-verify-jwt
node supabase/tests/closed-intake.mjs
```

`verify_jwt=false` is intentional for anonymous intake; the handler enforces CAPTCHA and capabilities. Do not use `--prune`. Defaults in the closed-intake test target production and require intake to be OFF. Verify all nine checks, run security advisors, and compare preservation snapshots. A successful deploy does not enable intake or authorize merging.

Read-only snapshot SQL (run as operator in the selected project):

```sql
select intake_enabled,
 (select public from storage.buckets where id='aoms-submissions') as bucket_public,
 (select count(*) from public.media_submissions) as submissions,
 (select count(*) from public.submission_batches) as batches,
 (select count(*) from storage.objects where bucket_id='aoms-submissions') as objects,
 (select count(*) from public.submission_canonical_events) as events,
 (select count(*) from public.submission_canonical_people) as people
from public.submission_settings where singleton;
```

The historical `security.sql` rollback fixture requires an empty, disabled inbox. Do not bypass its guard or run it against a populated production inbox; use isolated tests and read-only production permission checks instead.

## Non-destructive deployment rollback

1. Stop new authorizations first: as operator run `update public.submission_settings set intake_enabled=false, updated_at=now() where singleton;`. Keep static config disabled and remove any future CTA through a reviewed Git change.
2. Restore the previously exported function source in a separate temporary checkout. Redeploy **only** that function with its recorded JWT setting and the explicit project ref above. For the currently documented v1 intake implementation, commit `7b94618` records the corresponding source; confirm against the saved export before using it. The latest signed-TUS fix was never part of v1, so reverting to v1 is a closed-intake emergency fallback, not a working upload release.
3. Rerun closed-intake tests and compare the snapshot. Leave intake disabled until the incident is understood.
4. Preserve schema, migration history, rows, audit trail and private bucket. Reverting application code does not undo migrations. If old code is incompatible, keep the endpoint closed and deploy a reviewed forward repair. Take a backup and assess affected rows before any data repair; destructive recovery requires separate approval.
5. Already issued write URLs may still transfer privately. Do not delete their reservations or objects early; follow the batch expiry + 26-hour cleanup horizon. Do not empty the bucket or delete Storage rows with SQL.

No step here merges main, republishes media, or enables intake. Moderation approval and future GitHub publication remain separate operations.
