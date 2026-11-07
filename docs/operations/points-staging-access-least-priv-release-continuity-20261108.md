# EKODI Points staging browser — least-privilege Access continuity

Date: 2026-11-08 (KST). Task `points-staging-access-least-priv-20261108`, issue #7778.

## Verified functional source

Worker task PR #8801 was closed unmerged after the EKODI Orchestrator created official recovery PR #8802. Original source SHA `7b8ea39f840d80f78e1343e78a417cf6ebabc764` passed authentic first-party CI run `42392285876` (test and CI Orchestration Contract). Its Source Supabase Local CI, constitutional, security, Cloudflare boundary, parallel conflict and AI Orchestration checks passed.

During reconciliation with concurrent platform main changes, official recovery was synchronized to SHA `23d866e0de5d19f69c4250e6b0f6f17dd0316bfb` and bot-created `action_required` records appeared. These placeholders are not executed tests. This **documentation-only commit** requests actual owner-connected required CI at the latest recovery source without forging any status, bypassing merge authority or changing executable behavior.

## Security properties and remaining gates

- Developer-only Access policy is bound to a single protected token ID, never all valid service tokens. It requires `CF_ACCESS_STAGING_SERVICE_TOKEN_ID` to reuse a static token and otherwise creates a run-scoped ephemeral token under existing development permissions.
- Cleanup is scoped to the exact E2E run; an unrecognized Access app or unprotected staging host fails closed.
- Automated tests use mocked Cloudflare responses; no provider app, user membership, point balance, financial or database state is modified by this source change.

Official protected merge remains EKODI Orchestrator-owned. Real dev browser E2E execution, ephemeral fixture cleanup, genuine encrypted production backup/independent restore/ACL evidence, production schema release authority and points activation are **not** implied by a merged security patch. No economic rewards are authorized.

## Latest-main synchronization checkpoint

Official recovery previously passed authenticated CI and Orchestrator at commit `510758ee18ebf0b57fa1b9614a94aa9fecccf884` (CI run `42392515874`, all required checks success). Concurrent platform merges synchronized the *same official recovery branch* to `40382b6861f10f7654dff723559479e279746a4f`; GitHub-generated checks on this bot sync show `action_required` rather than authenticated executions. This documentation-only continuation asks for new owner-connected required checks on current main-equivalent HEAD. The functional least-privilege code, permissions, services, secrets, backup state and financial policy do not change. Actual protected merge and browser E2E must remain distinct evidence gates.
