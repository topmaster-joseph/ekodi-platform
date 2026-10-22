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

## Protected sync and genuine required CI regeneration — 2026-10-23

- EKODI Orchestrated PR Convergent Merge synchronized the release branch to protected
  `main` at head `67c173a56594c60f9a843134220428f2fbf5f35f`.
- GitHub marked the bot-authored merge commit's PR checks `action_required`;
  those checks are **not successful checks** and cannot authorize integration.
- This append-only owner-delegated checkpoint regenerates real required CI
  at the now-synchronized official release head. It does not change runtime
  code, permissions, orchestrator task identity, receipt, or deployment lane.
- Recheck required workflows and the exact current SHA before protected merge.
  No unverified deployment or UI success claim is implied.

## Revalidation after concurrent protected-main progress

- Latest trusted convergence synchronized `main` at
  `9f215a4d8bc9d206679b8e0690db16be50c5e03f` without replacing the
  Admin Assist feature with unrelated changes.
- GitHub again classified bot-authored check jobs as `action_required`;
  no test success is inferred from those jobs.
- This document-only owner-delegated update regenerates authentic PR checks
  against the synchronized release head. The Orchestrator retains authority
  for fresh SHA checks, protected merge, deployment, and live UI verification.
- Feature implementation remains the unmodified three-file change from
  source PR #5639. No new API credentials, permissions or finance scope.

## Third protected-base synchronization / genuine checks

The official merge controller synchronized the branch to `d19b23bb076f3738c0a447345faa290bbd5d0fa8`
after unrelated concurrent merges advanced `main`. The official PR remains the
only release candidate. The new bot-authored commit is not itself a passed CI
result. This owner-delegated **docs-only** source change re-requests genuine
required check jobs without changing feature behavior, underlying approval,
deployment identities or release protection.

Do not create a new feature branch, cherry-pick unverified runtime changes,
force-merge, or mark deployed without evidence.
