# Daily Devotion Notifications — EKODI official release continuity

Date: 2026-11-02 (Asia/Seoul)

## Immutable original source and authority
- Source PR: #7645 (closed as superseded, never directly merged).
- Source SHA: `87ebe8858f24091bca12f719a93f1b14b6b63b6b`.
- Official EKODI Orchestrator task: `orch_recovery_87ebe8858f24091bca12f719a93f1b14`.
- Release provenance PR: #7646, issued by EKODI, not this author.
- Release origin: `ai/chatgpt/orch_recovery_87ebe8858f24091bca12f719a93f1b14`.

## Authenticated CI continuity
EKODI issued the official recovery PR but held protected convergence for `authentic_required_checks_not_green`.
This documentation-only change requests authenticated GitHub Actions checks from the existing trusted official branch.
It does not invent a new task ID, generate a release receipt, change runtime code, alter branch protection,
approve a human gate, merge any PR, enable publishing, or deploy production.

Source checks passed: new and existing notifications tests 12/12, full build, additive migrations 220,
service boundary guard and source diff check. Revalidate the synchronized official branch and required checks
after any main updates; automatic source ancestry, current-base compatibility, receipt, and guarded
deployment remain mandatory.

## Hard operational boundaries
- `NOTIFICATION_PUBLISH_CHURCH_ENABLED` and `NOTIFICATION_PUBLISH_MISSION_ENABLED` are OFF unless separately configured.
- Private `NOTIFICATION_EVENT_SECRET_CHURCH` and `NOTIFICATION_EVENT_SECRET_MISSION` must be provisioned
in both the central API Worker and Bible Worker only after staged consent tests.
- Web Push uses its own VAPID/NOTIFICATIONS_SEND_ENABLED gate, also default OFF.
- A new publication triggers only for a successfully authenticated first draft-to-published state transition
on the current Seoul date, never for future drafts or repeated edits.
- Production acceptance requires verified Bible + central API release, consented inbox event receipts,
subscriber opt-out, real-device opt-in delivery and no future Scripture exposure.

Official convergence and service-specific guarded release workflows, not this document, own the next action.
