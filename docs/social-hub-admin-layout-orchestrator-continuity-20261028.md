# EKODI Social Hub Admin Workspace — Orchestrator release continuity (2026-10-28)

## Task and immutable source
- User request: improve the screen structure of the canonical Social Hub administration interface at `https://ekodi.kr/admin/services/social`.
- Source work PR: #6389 (`ai/chatgpt/social-hub-screen-20261028-0737`).
- Validated source commit: `197d057917f29c40facdd23798e4d77caaef2a6e`.
- Official EKODI release-provenance task: `orch_recovery_197d057917f29c40facdd23798e4d77c`.
- Official issued release branch: `ai/chatgpt/orch_recovery_197d057917f29c40facdd23798e4d77c`.
- Official protected integration PR: #6390.

## Purpose of this documentation-only continuity commit
GitHub marks pull-request checks created by GitHub Actions as `action_required`. The original source PR ran real checks successfully, but the official release PR was synchronized with a newer main at commit `49b7faf19576e21d8febfba96d2abf080a824779`. The updated release head needs its own genuine validation. This documentation-only author touch is intended to wake real checks and the standard convergent-merge workflow without adjusting application code, deployment workflows, CI assertions, secrets, permissions, or the release policy.

This note is not an approval of any unsupported action and does not grant authority to bypass existing gates. No manual merge or direct production deployment is authorized. Source application change must remain in the release branch ancestry.

## Accepted screen structure
1. Four main user tasks: site/channel selection; official OAuth connection state; publishing channel-to-site assignment; separate organization and public channel policy editing.
2. Real measured overview counts; no guessed connection counts; failure states are visibly separate.
3. Filterable site/service list and canonical links to each site-owned channel manager.
4. Responsive, compact layout in lazy-loaded `social-admin.css`, preserving the admin first-path CSS byte budget.
5. Accessible tab semantics and keyboard navigation.
6. Existing scopes and authorization, Vault-based credentials, scoped permission backend, disconnect confirmation, registry optimistic revision and data separation remain unchanged.

## Mandatory exact text and regression evidence
- `모든 현재·미래 EKODI 사이트와 서비스는 중앙 Social Hub 정책을 자동 상속합니다.`
- `OAuth 비밀값은 암호화 Vault에만 보관됩니다`
- Existing source `test/social-registry-control.test.mjs`, `test/multi-channel-control.test.mjs`, and new `test/social-admin-workspace-layout.test.mjs` must pass.
- Source work PR #6389 completed 9/9 substantive workflows successfully, including full CI and Admin Runtime Contract; verify again against THIS updated official-branch head.

## Completion boundaries
- Required real check runs on exact official branch head, release receipt, and protected merge into main.
- Guarded Admin/Shared Site staging and production release only through EKODI workflows.
- First-party authenticated browser: actual canonical route, tab switching, site search, scoped OAuth connections, publishing mapping, policy save; desktop 1366×768 and mobile 390×844 / 360×800.
- Missing real operational evidence remains pending, never mark `production-verified-complete` based on source CI alone.

## Latest-main convergence refresh (2026-10-28)
- Prior continuity check head `00decc1b8d5e9c3c92cf9c7e2f20689516bf3e0c`: all 9 substantive workflows completed successfully, including full `CI` and `EKODI AI Orchestration Gate`.
- Another authorized main change (system map admin layout) was synchronized into official head `e3a9affd78fa5d62345c2768394d6f608f212630` after the preceding checks.
- GitHub marked the synchronized head `action_required` due to bot authorship. This owner-authored documentation-only refresh wakes **real** current-head checks, rather than copying prior statuses or bypassing source/receipt enforcement.
- No application, tests, workflow, credential, release gate or user data are altered. Require fresh current-head green CI and protected release before any production claim.
