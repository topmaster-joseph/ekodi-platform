# LANG-UI-001 — owned native-browser evidence for independent Korean header

## Official EKODI provenance
- Source PR #4471, owner-approved exact SHA `9ec1e0624cf079be69397e89bb7854d34f9a55ee`.
- Exact-SHA Human Gate: https://github.com/topmaster-joseph/ekodi-platform/pull/4471#issuecomment-6129810492
- D1-backed official Orchestrator task: `orch_recovery_9ec1e0624cf079be69397e89bb7854d3`.
- Trusted recovery workflow: https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38288588448.
- Recovery branch: `ai/chatgpt/orch_recovery_9ec1e0624cf079be69397e89bb7854d3`.
- Source and Orchestrator-issued recovery branch were compared and matched exactly before creating canonical integration PR #4474.
- GitHub Actions token cannot create PRs (HTTP 403); the connected repository-owner identity created #4474 using the unchanged issued branch. PR #4471 was closed without merge to avoid duplicate paths.

## Real site evidence
- First-party isolated Chromium run https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38288341603 (artifact #11763319730) passed.
- EKODI homepage: live API HTTP 200, Korean-only published, header selector hidden and text locale aligned.
- Journal mobile: live API HTTP 200, Korean-only published, header selector hidden.
- SeonamMedi: independent `<header class="site-header">`, `<html lang="ko">`; live browser found zero language controls in its standalone header or footer. This is compliant with the Korean-only policy *without claiming it uses the shared Shell*.
- Script continues to test first-paint hidden, actual published-language eligibility, HTTP 429 no extra retry, 503/offline/malformed fail-closed, and recovery with synthetic local responses. These are not real multilingual publication claims.

## Acceptance boundary
- `liveDriftCount=0` for tested public pages; no real shared site had two or more published languages in the verified live sample. `liveCertified=false` is intentional and remains required until a real published-multilingual service passes header selector/API parity.
- Both document language and homepage content locale must independently belong to the actual live published list.
- No translation publication, security, auth, Cloudflare budget, agent credential, or production runtime mutation is authorized by this evidence-only verifier.

## Protected integration
This owner-authored documentation commit triggers EKODI's official `converge-orchestrated-pr-merge.yml` on the issued branch. The verified receipt, conflict guard, latest main sync, required source CI and protected merge are mandatory. Scheduled native monitoring on main remains separate from service translation publication. Track remaining real multi-published-locale proof in issue #4365.
