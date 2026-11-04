# EKODI Mission Saturday notice: protected release continuity
Date: 2026-11-04 (Asia/Seoul)

Authoring PR #8099, source commit `58eaca25d0973a2b313353603028439ebea3652d`.
EKODI Orchestrator official recovery PR #8100, task `orch_recovery_58eaca25d0973a2b313353603028439e`.
The source PR is superseded; only the orchestrator-issued recovery branch may be merged under protected checks.

The official branch currently needs authentic first-party CI on its current head. This documentation-only continuation commit requests those checks without altering source behavior, permissions, CI workflows, publication flag, stored credentials, database state, or deployment authority.

Source verification: 54 relevant notification, authorization, site calendar and admin tests passed; full production bundle build passed; D1 additive 221 migrations passed; service boundaries, retired-admin-source policy, Design Engine and git diff --check passed. The authorized scheduler remains **explicitly disabled** in the production Wrangler configuration `NOTIFICATION_MISSION_SATURDAY_NOTICE_ENABLED = "false"`, and the topic-specific credential and publish switch remain separate gates.

The official guarded release must still verify immutable source ancestry, authentic required checks on latest main, protected merge, staging and production Control API/Site Worker deployment, public calendar and opt-in availability, anonymous admin/event 403 responses, subscriber opt-out, and live OFF-state of the campaign. Do not treat a documentation change, a test run on a stale SHA, or a CI green but unmerged PR as a deployment receipt.
