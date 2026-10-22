# EKODI Admin Command Center · Protected Release Continuity (2026-10-23)

## Origin and immutable executable scope

- User requested redesign of the EKODI Admin AI command window on `/admin/accounts/audit-records`.
- Original feature PR: #5639 (closed by official release-provenance recovery).
- Original exact feature SHA: `333d651c25d72a890d74ba4ef6d08a1b30f64097`.
- Orchestrator-issued recovery PR: #5640.
- Canonical task ID: `orch_recovery_333d651c25d72a890d74ba4ef6d08a1b`.
- Canonical branch: `ai/chatgpt/orch_recovery_333d651c25d72a890d74ba4ef6d08a1b`.
- Follow-up issue: #5641.

## Explicit change boundary

The underlying feature changes only the EKODI Admin Assist UI components in
`admin-assist-dock.js`, `admin-assist-dock.css`, and the new regression test
`test/admin-command-center-ux.test.mjs`. All existing service authorization,
external AI privacy gates, deployment authority, Human Gate requirements, and
official execution APIs remain unchanged.

The non-home Admin page should retain visible task context when the AI command
panel opens. The panel is a bounded right-hand workspace on desktop, full-screen
inside the mobile Admin shell, with only one active command composer. A model
response is NOT production execution evidence.

## Authentic CI and release gate regeneration

This owner-delegated documentation-only checkpoint requests authentic required
pull-request checks and the existing **EKODI Orchestrated PR Convergent Merge**
workflow on the current, officially issued branch. The existing first-party
workflow (not this document) must synchronize latest `main`, recheck collisions,
verify the D1-backed release receipt, run all required CI and staging/rollback
gates, and perform any authorized protected merge.

At the start of this checkpoint the feature branch was behind protected `main`,
but the intervening `main` changes did not touch the three feature files
(revision comparison `fe2e6d3...main`). Recheck that fact immediately before
any convergence, because parallel changes may continue.

The workflow must never treat `action_required`, missing checks, a response from
the AI provider, or this documentation as a passing CI result or a production
verification receipt. If the branch is re-synchronized by a bot and GitHub cannot
run check jobs, use another permitted **owner-authored docs-only CI checkpoint**
without modifying tested executable source.

Final release claims require actual protected merge, bounded staging promotion,
production asset verification on `https://ekodi.kr/admin/accounts/audit-records`,
and real authenticated PC/mobile browser regression for open, close, command,
history, Admin context, and authorization boundaries. Report any missing evidence
as unverified rather than completed.
