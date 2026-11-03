# EKODI notification per-topic publisher guard — protected release continuity

Date: 2026-11-04 (Asia/Seoul).

- Source authoring PR: #8027, source SHA `cd350616554e0590c849ac22c71fc8cc919e44cd`.
- EKODI-issued official recovery PR: #8028.
- Official task: `orch_recovery_cd350616554e0590c849ac22c71fc8cc`.
- Official branch: `ai/chatgpt/orch_recovery_cd350616554e0590c849ac22c71fc8cc`.

The source PR was superseded without direct merge. The Orchestrator parked official recovery because authentic required checks were not green yet. This **documentation-only continuity** commit requests new first-party GitHub Actions checks on the existing official branch. It does not change any business logic, secret values, permissions, workflow definition, protected release receipt, staging, or deployment authority.

Source tests: 37 notification/security/site-admin tests passed; full build passed; additive D1 migration checks (221), service-layer boundaries, retired-admin-source policy and design validation passed. It removes global legacy event-key authority and requires explicit per-topic allow switches plus server-only per-topic keys. Existing Web Push and publisher flags are not automatically activated. All seven topics remain fail-closed by default.

Completion still requires the EKODI Orchestrator to verify current-main ancestry, authentic GitHub required checks, merge under branch protections, guarded Control API + admin/site deployment and production smoke tests. No ownerless direct merge, release or secret activation is authorized by this note.

## Current-main protection revalidation
After first-party tests passed on the previous protected recovery head, EKODI synchronized another independent main change. Source SHA remains an ancestor. This non-executable note requests authentic CI on the synchronized source while preserving release receipts, permissions, and secret isolation.

## Third protected merge check
Another independent EKODI release updated main and the Orchestrator synchronized the official branch. The source SHA remains in ancestry, and no source changes are made. Revalidate the current branch with authentic GitHub Actions rather than treating action-required checks as green; no direct protected merge or deployment bypass is used.
