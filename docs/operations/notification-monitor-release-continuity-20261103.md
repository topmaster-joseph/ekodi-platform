# Notification monitoring protected release continuity

Date: 2026-11-03 (Asia/Seoul).

Source authoring PR: #7882, original source SHA f7ff521ed3a61db1772cd02aa43235271a8ea21d.
EKODI-issued protected recovery PR: #7885.
Orchestrator recovery task: orch_recovery_f7ff521ed3a61db1772cd02aa4323527.

The official protected recovery branch was issued by the EKODI Orchestrator. It is awaiting authentic required CI checks. This documentation-only continuity commit requests authenticated checks on that existing branch; it does not alter runtime behavior, identity permissions, workflow definitions, notification delivery, branch protection, deployment privileges or release receipts.

The original source passed 26 relevant notification and admin tests, a full build, 220 additive D1 migration checks, service boundary checks, administrator-source policy and whitespace validation. The new functionality is strictly read-only: seven/thirty-day/all-time event-cohort metrics, stalled queue counts, and current device subscriber counts. It preserves all site-scoped authorization and keeps automatic publishing and Web Push disabled by default.

A complete release additionally requires actual first-party CI on the latest approved main, EKODI-managed protected merge, Control API and Site/Admin guarded production deployments, anonymous 403, and authenticated desktop/mobile dashboards. Do not classify this note as deployment evidence.
