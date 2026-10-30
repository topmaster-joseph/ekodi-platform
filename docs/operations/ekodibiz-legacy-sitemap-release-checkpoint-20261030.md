# EKODIBIZ legacy sitemap — guarded release checkpoint (2026-10-30)

## Source and authority
- Owner screenshot evidence: Naver 404, Google cannot fetch, Bing processing for `https://ekodibiz.kr/sitemap.xml`.
- Original functional changes: `93e6ec40075b1b7c82cad67e7616ec050b39eece` in superseded PR #7077 (preceded by #7074).
- Official EKODI orchestrator recovery: PR #7078, task `orch_recovery_93e6ec40075b1b7c82cad67e7616ec05`, on branch `ai/chatgpt/orch_recovery_93e6ec40075b1b7c82cad67e7616ec05`.
- This checkpoint adds **no functional changes** and does not approve deployment. It requests exact current-head CI checks on an owner-authored commit after the GitHub bot-created recovery PR was parked as `action_required`.

## Required acceptance before merge
1. Current official PR HEAD retains the source commit as an ancestor. EKODI AI orchestration release receipt is verified for the exact official branch.
2. Actual current HEAD **and** merge commit are covered by passing required statuses and workflow checks. `action_required`, pending or historic statuses do not count.
3. `biz-legacy-redirect.js` keeps normal page 301 behavior and the legacy apex Naver verification file; `/sitemap.xml` redirects to the canonical `https://ekodi.kr/sitemap.xml` and `/robots.txt` declares that canonical map. Unknown hosts remain denied.
4. Regression tests, Cloudflare boundary audit, and parallel-change conflict guard are green; no governance check is weakened.
5. Cloudflare guarded legacy-domain deployment remains a separate official, orchestration-authorized release with no changes to MX/TXT records or payment/auth domains.

## Production release verification (not satisfied by this document)
- `https://ekodi.kr/sitemap.xml`: HTTP 200 with XML `<urlset>`, only published canonical URLs; no auth/admin URLs.
- `https://ekodibiz.kr/sitemap.xml` and `https://www.ekodibiz.kr/sitemap.xml`: direct 301 Location `https://ekodi.kr/sitemap.xml`.
- Legacy `/robots.txt`: HTTP 200 and canonical sitemap declaration on both hosts; existing owner-issued Naver verification file: HTTP 200 on apex.
- Reopen Google, Naver and Bing **canonical ekodi.kr properties** and verify collection/status; submitted legacy property screenshots are migration evidence, not success.
- Record actual statuses, URLs and UTC timestamps in release evidence. Do not claim search-engine indexing until independent provider reports establish it.

## Guardrails
No direct push to main, forged statuses, manual production changes, bypassed human gates, unreviewed DNS edits, or claim of completed deployment without production verification.

## Current-main synchronization checkpoint
- GitHub reported an automated update-branch source head `bcb4921a491a1b3e1b109856906fe31e64f44927` after main advanced. That bot-authored head's PR checks were parked as `action_required`; they are **not passing evidence**.
- This note is a documentation-only owner-authored retrigger to obtain actual current-head required checks. It does not approve a merge or production release, and the functional source SHA `93e6ec40075b1b7c82cad67e7616ec050b39eece` must remain an ancestor.
