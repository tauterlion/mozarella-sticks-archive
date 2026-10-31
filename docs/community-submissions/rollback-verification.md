# Rollback-only database security verification

Date: October 30, 2026. Project: `kvyrbtooynofijdtmqup`.

Executed with explicit owner approval after the migration pause. No next-milestone deployment was performed.

## Result

All 45 SQL security checks passed against hosted Supabase and the local PostgreSQL test engine. Coverage includes anonymous/authenticated access denial, backend inability to enroll moderators or enable intake, required consent, canonical IDs, metadata size/type constraints, the 50 MiB boundary, expired-batch finalization, workflow transitions, publication mapping, immutable verified originals, audit/version recording, and verified-removal requirements.

The script ended with `ROLLBACK`. The audit sequence was transactionally restarted for the tests so its counter also rolled back, rather than leaving nextval gaps. The temporary intake-on setting was confined to the uncommitted test transaction and was never visible to other requests.

Independent read-only post-test verification:

- Intake: disabled (`false`).
- Submissions, batches, moderator allowlist entries, audit rows, removal reports, rate-limit rows, Auth users and stored submission objects: all zero.
- Audit sequence: `last_value=1`, `is_called=false`, identical to before verification.
- Storage bucket remains private, with the existing 52,428,800-byte cap.
- Canonical validation cache remains 37 people / 112 events.
- No public/storage RLS policies and no deployed Edge Functions.

Supabase security advisors report nine informational `RLS Enabled No Policy` findings, reflecting the intentional deny-by-default tables. No warning/error findings were returned. These policies should not be opened merely to silence the informational advisor: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Remaining gates

This verifies database constraints/permissions, not end-to-end upload security or actual file-byte inspection. Public release remains blocked by Turnstile setup (owner confirmed it is not configured), secure intake/finalization endpoints with trusted-ingress rate limiting and quotas, moderator account/allowlist and protected console, content/metadata processing, GitHub publishing and verified takedown integration, cleanup/monitoring, and full API/browser/security acceptance tests. No public CTA or upload endpoint has been enabled.
