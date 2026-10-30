# Approved migration and closed backend verification

Verified on 2026-10-30 for Supabase project `kvyrbtooynofijdtmqup`, draft PR #18, branch `feat/community-submissions-foundation`.

The owner explicitly approved the specific SQL previously reviewed in PR #18. It applied successfully as `20261030232342_secure_submission_intake`. The local migration filename now matches hosted history; SQL content is unchanged. No main-branch merge occurred.

## Preservation

Before/after snapshots both showed zero submissions, batches, audit records, rate counters and stored objects. There were no existing uploaded submissions to migrate or delete. Full bucket configuration was identical, including `public=false`, its original creation/update timestamps, the 50 MiB cap, and five allowed MIME types.

All 112 cached event IDs and 37 cached person IDs were preserved; sorted-ID hashes matched before/after:

- Events: `7b59916eef61b83d41f5a0b8ff2ea180`
- People: `0f57bfa49bfaeb0eda25799e0c9c186c`

Only the approved event-era cache refresh changed existing cache values. Original GitHub timeline/people/media manifests and all assets have no diff against main. Archive validation passed with zero errors or warnings.

## Security results

- 45 hosted SQL security checks passed after migration. The transaction ended with `ROLLBACK`. Final checks found no fixture submissions, batches, audit records, removal requests, rate counters, moderator records or Auth users. Audit sequence remained `last_value=1,is_called=false`.
- Hosted permission checks confirmed no anon/authenticated execution privilege on `submission_intake`, and backend execution allowed. Calling `tick` as the backend returned `intake_disabled`.
- 25 local intake database checks and 32 request/stream/file security tests passed again after migration filename reconciliation.
- Security advisors reported no WARN/ERROR findings. Nine INFO [RLS-enabled/no-policy notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) are intentional: browser roles receive neither table grants nor access policies.

## Closed deployment

`community-submit` version 1 deployed ACTIVE. JWT gateway verification is disabled only for this deliberately anonymous endpoint; its own origin, server CAPTCHA, durable throttles and batch-capability checks protect intake. The database release switch remains false, and static config remains disabled.

Nine real HTTP checks passed using `node supabase/tests/closed-intake.mjs`:

- `batch`, `resume`, `authorize`, `complete`, `cancel`: HTTP 503 with exactly `{"error":"intake_disabled"}`, approved-origin CORS and `Cache-Control: no-store`.
- Missing or unapproved Origin: HTTP 403, no permissive CORS header.
- Approved OPTIONS preflight: HTTP 204.
- GET: HTTP 405.

No signed upload capabilities were issued. A subsequent database check confirmed intake false, private bucket, and zero records/objects. No cleanup job was run or scheduled.

Turnstile setup, positive hosted upload/TUS and cleanup tests, long-queue renewal/cancellation coverage, moderator enrollment/console, verified takedown and GitHub publication remain release gates. Closed-endpoint checks do not establish that those later flows are ready. Nothing has been enabled publicly or merged.
