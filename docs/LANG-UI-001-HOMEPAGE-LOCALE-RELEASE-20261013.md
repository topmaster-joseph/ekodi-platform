# LANG-UI-001 — EKODI homepage locale parity guarded release

## Authority

- Source PR: #4438, approved exact SHA `38403c6e21607c53e2ddf6455e6654db41f6794b`.
- Human Gate: https://github.com/topmaster-joseph/ekodi-platform/pull/4438#issuecomment-6128245375
- Authoritative EKODI Orchestrator task: `orch_recovery_38403c6e21607c53e2ddf6455e6654db`
- Source and recovery branch start with exactly the same SHA, recorded in GitHub.
- Recovery workflow: https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38276909653
- GitHub Actions token denied PR creation with HTTP 403; connected repository owner's GitHub account created canonical integration PR #4439, preserving the issued branch and receipt.
- Source PR closed without merge to avoid competing release lanes.

## Incident: published-language and homepage text mismatch

Native Chromium pre-release run https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38276752123 observed that `/api/i18n/v1/status?service=ekodi` returned only `ko-KR` while homepage document/content locale was English. Header control was hidden as expected but independent `homepage-ambient.js` cookie/localStorage/browser negotiation could render un-published English, even during asynchronous initialization.

## Remediation and regression guards

- Homepage locale now derives only from published shared Shell readiness and defaults to Korean before readiness.
- Post-async rendering re-evaluates authoritative shared locale.
- Browser DOM assessor separately checks document `lang` and homepage content locale against the actual published-language API.
- Native Chromium fixes synthetic readiness and live API/DOM evidence separately; pre-merge production mismatch is a baseline, NOT a green live deployment result.
- Protected guard checks, native test, 429 stop conditions and Cloudflare release receipt stay mandatory.

## Convergence and release boundary

This documentation-only owner-authored commit requests the official `converge-orchestrated-pr-merge.yml` on the Orchestrator-issued branch. It does not authorize direct protected branch writes or grant extra secret/security permissions. The protected merge must pass exact-head required statuses and staging/production rollout.

Do **not** certify the bug fixed without a post-production-deployment first-party native Chromium check confirming both EKODI homepage and Journal display only a published locale. Track issue #4365 separately for SeonamMedi independent header and genuine published-multilingual positive acceptance.
