# EKODI Research — guarded canonical route activation and proof

## Background
- Human-approved Research source PR #5091 at `8242c82185650b6abe483f1e043c2f525734f4e2`.
- Official recovery PR #5121 merged as `35f2d62f756ef95dca4a0e94dd20496fa135760b`.
- Education Worker production protected release [38989516972](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38989516972) passed, including native Education-only PC and mobile checks.
- A real browser visiting `https://ekodi.kr/research/` still displayed the unrelated existing 운영공간 surface. This is NOT a verified Research launch.

## Cause and safer release scope
`platform-route-registry.js` contains the correct `/research` -> `EDUCATION` alias on main, but the latest Site Core production was built before that merge. A GitHub-Actions-token protected merge does not generate a normal main push event; the common convergence release classifier does not currently include `platform-route-registry.js`.

Instead of changing the shared convergence script and causing collateral Control API/Shell/CGMA dispatches, this minimal PR touches **only existing guarded Site Core release assets**:
- Add `/research/` and `/research/health` as explicit verifiable canaries to `deploy/manifests/shared-site.worker.json`.
- Use the existing `sharedSiteTouched` trigger for that exact manifest path. Receipt-bound deployment and rollback are unchanged.
- Add two dedicated EKODI-owned native Chromium jobs, desktop and mobile, without displacing existing board checks.
- Add static tests that assert route ownership, canary expectations, immutable orchestrator receipt requirements and native job contracts.

## Security / Human Gate
This changes an existing production release manifest and workflow, therefore it is a new source revision requiring fresh, exact-SHA GitHub-owner Human Gate approval and official EKODI orchestration. Do not reuse the original PR #5091 approval marker. No manual or unguarded deployment is approved.

## Required acceptance
- All required GitHub CI, architecture, conflict, security, staging checks pass.
- Official orchestrator issues a receipt-bound recovery branch.
- Existing guarded Site Core production Worker release passes canary `https://ekodi.kr/research/` with Research-specific form markers, and `/research/health` confirms high-risk features off.
- Distinct EKODI native browser desktop/mobile jobs succeed on the canonical Research route and retain proofs.
- Do not claim Research researcher login/private DB, manuscript uploads, consultation intake, real external AI or payment functionality is live without separate verified server credentials and tests.

## Residual prevention
Generalizing the central convergence classifier to include every future route-registry change remains a distinct source-policy improvement. It is not silently authorized by this route-specific production repair.

## Owner-authored CI for official recovery branch
- User-approved immutable source: PR #5125 at `748588a8dfd17b9958345f7b77ec8d66e0edbf2c` with GitHub owner comment [#6231571190](https://github.com/topmaster-joseph/ekodi-platform/pull/5125#issuecomment-6231571190) and subsequent `orchestrator-human-gate-approved` label.
- Official EKODI recovery task `orch_recovery_748588a8dfd17b9958345f7b77ec8d66` and protected PR #5126 were issued by source verification workflow #39016335856.
- Bot-created PR checks initially returned `action_required`. This owner-authored documentation-only commit regenerates genuine required checks without modifying any executable code, authorization, rollout or rollback policy. Do not merge without all real CI/check runs passing.
