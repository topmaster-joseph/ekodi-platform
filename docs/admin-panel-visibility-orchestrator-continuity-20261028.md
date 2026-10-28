# EKODI ADMIN-PANEL-VISIBILITY-20261028 — Official Orchestrator Release Continuity

## Original authority and defect evidence
- Request: repair the Social Hub admin screen and finish actual deployment verification.
- Source task PR: #6413 at SHA `682e2f928fd957f8815c4b8a8d8299de87b1eb57`.
- Source predecessor #6401 / stale official recovery #6402 were closed due to actual conflict after #6400 merged.
- Official task: `orch_recovery_682e2f928fd957f8815c4b8a8d8299de`.
- Official issued branch: `ai/chatgpt/orch_recovery_682e2f928fd957f8815c4b8a8d8299de`.
- Official guarded PR: #6417.
- Production evidence: deployed admin Chromium screenshot `menu-social.png` in run #40598759285 showed '에코디 시스템 구조 개요' instead of Social Hub though menu panel activation had passed.
- Root cause: `system-map-admin.css` architecture display:block!important overrode hidden-panel display:none.
- #6413 rebuilt on main after merged #6400; preserved its engine-catalog desktop/mobile E2E.

## Reviewed parallel changes
- Current related domain-control PR #6397 adds *synthetic* `.invalid` fixtures and domain UI acceptance checks to the same production E2E script.
- Merged #6400 adds service engine CSS/mobile E2E; preserved in #6413.
- Earlier conflicting recovery #6402 closed, never merge.
- Cross-review and first-integration selection are recorded in official PR #6417 with marker `[EKODI RELATED CHANGE REVIEW]`. First winner #6417, followed by refreshed #6397. This documentation does not replace the audit comment or labels.

## Why this checkpoint exists
GitHub marks bot-authored official recovery PR workflow checks `action_required`, even after genuine source-head CI. This **documentation-only** authored update is intended to start authentic official-head checks. It does not change app behavior, workflow definitions, CI expectations, security, credentials, source code, user data, or the release receipt.

## Non-negotiable acceptance
1. Exact current-head required `test` and `EKODI AI Orchestration Gate` status success; all other required checks green and no actual merge conflict.
2. Central EKODI Orchestrator-issued provenance and protected integration; do not merge task PR directly.
3. Guarded Shared Site/Core release with no-route staging, artifact continuity, candidate 0%, route/promotion/rollback checks.
4. Authenticated **real** Admin Chromium check must verify inactive architecture panel remains hidden under other menus; Social Hub all four tabs work, site-directory search hides/restores entries, 390px mobile fits, and screenshot `menu-social.png` actually shows social UI (not architecture overview).
5. No external OAuth, publication, policy or other mutation during read-only E2E.
6. Only mark `production-verified-complete` once release AND live browser evidence pass. If blocked, report exact failure without relaxing checks.

No labels or release protections are bypassed by this documentation.
