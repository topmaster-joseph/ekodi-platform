# EKODI canonical Control Github operations

Issue #6630. The AI operations panel and the standalone /admin/control are different views. This change places a direct GitHub operations tab into the canonical Control UI.

The tab loads authenticated GET /api/control/ai/v8/github only when opened or manually refreshed. The backend requires super_admin and ai:read. The UI displays real observation jobs and labels unconnected GitHub quota measurements as unknown, never claiming a successful deployment. Existing release and human gates remain mandatory.

Rollout: protected CI, protected Site Core deployment, signed Webhook/Cloudflare secret provisioning, approved D1 migration and verified super-admin end-to-end test. No GitHub write or production action is issued by the tab.

## Exact-head EKODI protected convergence

Official Orchestrator recovery PR #6684 for issue #6630 supersedes source PR #6682. The authenticated read-only Control panel update needs owner-authored exact-head checks; no source-only or bot-event check is treated as a release receipt. Protected Site Core deployment, production canary, and actual super-admin session rendering remain independent acceptance criteria. Webhook secret, install identity and D1 migration are not enabled by this UI change.

## Protected merge-base refresh, 2026-10-29

The EKODI Orchestrator merged the latest main branch into recovery PR #6684 after the prior exact-head CI passed. The refreshed head must receive fresh authentic required CI and AI Orchestration Gate checks. This note is not itself a release receipt, approval, or permission to bypass guarded production verification. The GitHub Control tab remains a read-only super-admin screen and webhook secret provisioning remains a separate human-owned prerequisite.

## Second protected-main synchronization

The first verified head `80e44adc11d2563ac65adced9eca6e29a2248e25` completed all required CI checks. EKODI Orchestrator synchronized a subsequent main commit into the PR, generating an updated head and requiring new exact-SHA checks. This authored note triggers genuine source checks on that updated head without bypassing GitHub protection. The approval and release status must always be evaluated against the **latest** head SHA.
