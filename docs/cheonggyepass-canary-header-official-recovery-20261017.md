# Cheonggye Pass guarded Control API canary-header recovery — 2026-10-17

Documentation-only owner-authored CI re-trigger on the **official EKODI Orchestrator-issued recovery branch**. No executable behavior, security policy, API logic, database schema, or deployment gate is modified by this file.

- Source correction: [PR #5171](https://github.com/topmaster-joseph/ekodi-platform/pull/5171), exact owner-approved SHA `5a55adf4aeb4433159e49bfd93bcfde8c4d3bfd4`.
- Human Gate owner comment: https://github.com/topmaster-joseph/ekodi-platform/pull/5171#issuecomment-6233591356.
- `orchestrator-human-gate-approved` applied **after** the owner comment.
- Official D1-backed recovery task: `orch_recovery_5a55adf4aeb4433159e49bfd93bcfde8`.
- Official source-converged branch: `ai/gpt6/orch_recovery_5a55adf4aeb4433159e49bfd93bcfde8`.
- Protected recovery PR: [#5181](https://github.com/topmaster-joseph/ekodi-platform/pull/5181).
- GitHub conflict-free latest-main integration commit: `d7ad667f9351ac75917dc212f7096dc4796195cd` with parent source `5a55adf4aeb4433159e49bfd93bcfde8c4d3bfd4` and protected main `bc625c9e036f7a373032ee5942acaf8064741458`.

## Failure evidence and scoped correction

The previous [protected Control API deployment #39028549573](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/39028549573) returned expected HTTP 401 `REGION_AUTH_REQUIRED` for the new vendor intake endpoint but rejected the canonical gateway response because the release manifest required the literal `cache-control: private, no-store` header. The response was not cacheable; the gateway supplied `no-store`. Automatic rollback was verified.

The correction only requires `cache-control: no-store` at the canonical release probe while retaining all 401/no-sniff restrictions and the underlying origin's `private, no-store`. No vendor security scope, ZIP code execution, external API requests, payment, or settlement has been enabled.

## Protected release requirements

1. Genuine owner-authored GitHub Actions statuses on the current official branch HEAD: CI, EKODI AI Orchestration Gate, conflict/convergence checks, and necessary security checks. `action_required` is not success.
2. Latest-main ancestry and no conflicts; no force push, credential exposure, or branch protection bypass.
3. Guarded merge followed by the receipt-bound Control API workflow: isolated staging, D1 additive migration, private R2 bucket binding, 0% candidate verification, rollback safeguards, and validated final production promotion.
4. Confirm the canonical live endpoint returns HTTP 401 for unauthenticated users and emits `no-store` and `nosniff`, without disclosing private data.
5. Real Google login, scoped external-vendor access and ZIP/API submission on PC/mobile remain necessary before **full functional completion**.
6. Related Site Core native-mobile overflow in seasonal workforce MOU is a separate issue and must not be hidden by this narrowly scoped repair.

This documentation commit does not authorize release unless all guards are satisfied.

## Protected latest-main convergence, round 2

GitHub's first-party convergence workflow merged protected main `14c71fe4e6e8b49443e08fb4370b6d917c4362db` into the approved recovery branch as `b87c0ceecac0b02b468dd4ece091fc781898476e`. The approved source remains an ancestor. This documentation-only touch requests authentic required checks on the updated official branch before guarded merge, without changing executable code or authorizations.
