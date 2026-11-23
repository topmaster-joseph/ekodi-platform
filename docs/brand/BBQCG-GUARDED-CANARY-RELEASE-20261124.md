# BBQ 무안청계점 개점일 보호 운영 검증

## EKODI 중앙 작업 provenance
- 공식 intent #10303, 사용자 요청 2026-11-24 BBQ 무안청계점 온라인 영업준비 점검 개선.
- 공식 UX source recovery merge #10305, Mission public runtime marker recovery merge #10311, Mission postrelease validator recovery merge #10313.
- 기존 prod run [45206555497](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/45206555497)에는 Worker customer-facing BBBQ 11/24 opening + telephone CTA + PG-off proof, but Mission postrelease verification failed on legacy /ekodimission asset expectations.
- Source PR #10314 SHA b607701e4b2d0dee9ee251302ecd078d479868cd adds two truthful read-only /bbqcg & /bbqcg/order guarded release canaries, never creates checkout, never weakens strict Mission checks. Official orchestrator task orch_recovery_b607701e4b2d0dee9ee251302ecd078d; protected recovery PR #10315.
- This owner-authored documentation-only commit regenerates authentic protected checks following GitHub bot pull_request action_required. It does not alter executable code, PG/auth, tenant scope, route, rollback or release policy.

## Required outcome
PR head CI/security/orchestration all green, protected merge, guarded Operating Space production dispatch with successful full postrelease checks, /bbqcg opening date and callable telephone button live, /bbqcg/order no checkout and no store auto-intake, QR guide accessible. Operator-approved menu prices/MID/notification ACK are separate Human Gates.

## Safety
No direct main push, no unguarded workflow dispatch, no payment enablement or unverified menu/price, no private Opera tabs. Report success only after actual production run and live proof.

## Post-sync required CI refresh

The EKODI convergent merger synchronized PR #10315 against current protected main, changing its exact head to afc48117fed4c4c8e16d4c38c9eca82490b0ea65. The resulting bot-generated PR checks reported action_required without executable jobs. This owner-authored documentation-only update re-requests authentic CI on the now-synchronized branch. All executable source and policy remain unchanged; actual green checks, protected merge, guarded production release, and BBQ live evidence are still required.
