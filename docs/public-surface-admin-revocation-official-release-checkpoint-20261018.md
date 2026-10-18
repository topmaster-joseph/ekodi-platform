# Public-surface administrator revocation — official protected convergence checkpoint

Date: 2026-10-18 (Asia/Seoul).

## Source and authorization provenance

- Parent engineering and rollout issue: #5148.
- Original protected source PR: #5231.
- Exact owner-approved immutable functional source SHA: `3724deff44b6bec9f56d7767222abfa8089e8c5e`.
- Owner's Human Gate marker was recorded as `EKODI-HUMAN-GATE-APPROVE:3724deff44b6bec9f56d7767222abfa8089e8c5e` before label `orchestrator-human-gate-approved`.
- First-party release provenance recovery: PR #5254, task ID `orch_recovery_3724deff44b6bec9f56d7767222abfa8`, branch `ai/gpt6/orch_recovery_3724deff44b6bec9f56d7767222abfa8`.
- The source commit must remain an ancestor of any protected merge. This documentation-only follow-up does not change executable code, deployment semantics, authentication, user content, permissions, finance, or database state.

## Why this non-executable continuity commit exists

The recovery PR was emitted by a trusted GitHub workflow. GitHub classified its original PR-triggered checks on the bot-created SHA as `action_required`; such results are **not** valid required CI pass evidence and must never be counted as success.

An owner-connected docs-only push to the **existing orchestrator-issued recovery branch** requests fresh, real GitHub Actions checks and starts the repository's original `EKODI Orchestrated PR Convergent Merge` push workflow. That workflow, not this document, may invoke GitHub protected `update-branch` with current main, wait for verified required check-runs, confirm authoritative orchestration receipt and only then perform its normal protected merge. No branch-protection waiver, manual direct main commit, private admin role expansion, forged receipt or claimed success.

As of this checkpoint, main advanced by other Church, Control and CheonggyePass changes. A preliminary file-name comparison of the original six source files against current main showed no direct overlapping changed file paths, but that is **not** proof of conflict-free semantic integration. The official update-branch conflict and validation remain mandatory.

## Exact released scope and acceptance gate

Functional source files:
1. `shell/public-surface-admin.js`: clear stale UI on logout, failed/revoked server authorization and asynchronous auth races; retain same-origin and server-scoped permissions.
2. `sites/seonammedi/public/voice-public-admin.js`: discard stale private rows and the separate voice/reply editing UI on permission loss/account switch.
3. `test/public-surface-admin-revocation.test.mjs`.
4. `test/seonammedi-voice-admin-revocation.test.mjs`.
5. `package.json` surface UI gate tests.
6. `.github/workflows/deploy-ekodi-shell.yml` Shell release regression gate.

At the approved functional SHA, source CI verified `Full test suite: PASS` and `EKODI UI Surface policy OK` before the Draft merge-status guard stopped release. The official recovery PR needs fresh required CI after this docs change and after latest-main synchronization. Post-merge guarded release must dispatch both the shared Site Core and Shell Worker because this touches `sites/` and `shell/`; preserve previous Admin fallback until verified.

Production acceptance requires authentic same-origin Google login, guest/viewer/manager/role-revoked verification, citizen opinions CRUD only with authorized test data, no duplicate menu or accidental data deletion, and native EKODI Chromium on PC and mobile including the fresh-visitor and logged-out paths. Keep #5148 open and never claim all 37 services completed from a single shared rollout.
