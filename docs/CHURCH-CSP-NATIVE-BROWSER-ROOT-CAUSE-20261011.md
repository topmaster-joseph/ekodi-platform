# Church CSP repair — EKODI-native Chromium evidence and guarded release

## Root cause
The EKODI first-party isolated Chromium run #38135300886 visited the real canonical Church homepage and found that the production CSP `connect-src` blocked the existing project host `renzehysxirjilvdxacv.supabase.co`. The public worship management runtime was served (HTTP 200) and received an authenticated-looking local browser fixture, but the browser refused its outbound capability request *before* it reached the network. This was a genuine Church Pages policy defect, not a reason to bypass RLS or user authentication.

## Independent Church fix
The Church repository `topmaster-joseph/ekodi-church` merged PR #106 at `4483be8b76f5ae07246769e8c8fb1924b900a783`. In `_headers`, only the original production Supabase project host was added to `connect-src`. `script-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'` and the remaining security policy stay enabled. No EKODI subdomain, wildcard or `unsafe-eval` was introduced.

## Protected production check
This Platform change only updates the existing Orchestrator-guarded Church Pages deployment workflow to verify the source `_headers` and the real production Content-Security-Policy header after promotion. If the live header is still restrictive the release **must fail**. No bypass of CI, WAF, authentication or Cloudflare credentials.

The follow-up first-party EKODI Chromium PR #4224 separately verifies guest hidden, simulated permit visible, simulated revoke hidden and logout hidden, on the actual served homepage. Its synthetic capability responses are local to the disposable browser, never upstream, and are **not** proof of a real Google administrator session.

Recovery must use a fresh exact-SHA owner approval, official EKODI Orchestrator receipt, protected merge, guarded Cloudflare deployment, and real browser re-verification. Commit synchronization must not substitute stale check statuses.
