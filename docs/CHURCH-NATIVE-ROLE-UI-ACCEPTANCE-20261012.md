# EKODI Church native virtual-browser acceptance record

## Implementation and authority

The source PR #4224 contributed `scripts/ekodi-church-native-role-ui-canary.mjs`, its tests, and the GitHub-hosted **EKODI-owned isolated Chromium** workflow. The official Orchestrator candidate is #4236 and receipt task `orch_recovery_9f333e866c10949edd3225f4fb8624be` is authorized. This is not an external Desktop Commander or SaaS remote browser.

## Tested user interface lifecycle

The browser loads the actual deployed `https://ekodi.kr/ekodichurch/` asset. A fake **local-only** token is prevented from reaching the network and only the exact worship capability endpoint is intercepted in the disposable headless profile.

1. Visitor: admin link hidden on production HTML.
2. Browser-local mock allowed response: admin link visible.
3. Revalidation: exactly one link.
4. Browser-local mock revoked: admin link hidden.
5. Browser-local logout: admin link hidden, no subsequent privileged request.

Captured artifacts describe `realUserAuthenticated=false` and `serverRoleResponsesSimulated=true`. This success **must not** be reported as real Google administrator login or a live authorized API 200. Real live unauthenticated 401 and foreign-Origin 403 are validated separately through the production guest contract.

## Native production evidence

- The production Church CSP repair is merged in independent Church #106, gated platform #4234, with Pages deployment #38136460992.
- Existing native Chromium workflow #38135300886 was re-run successfully after CSP correction, according to #4236 review.
- Actual Google administrator E2E and native Windows Device Agent real heartbeat/receipt still require separate verified, authorized sessions. Never use a user's ordinary browser profile or impersonate an identity.
- PR branch protection, full CI, and EKODI official release receipt remain mandatory. A GitHub Action check reported `action_required` on an Orchestrator bot-authored synchronization commit; the repository owner's documentation-only commit refreshes checks on the exact latest source. No status checks are falsified.
