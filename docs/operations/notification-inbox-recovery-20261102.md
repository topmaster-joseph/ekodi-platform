# Notification Inbox — EKODI official release continuation (2026-11-02)

## Source and provenance
- Approved work intent: continue the EKODI common subscription notification service with a free, explicit-consent, in-site inbox.
- Authoring PR #7612; exact functional head SHA `92c55e0ac1b116e2c1edce480f35c96d7d4a45cd`. Its authoring PR is superseded and must not be merged directly.
- Official orchestrator release task `orch_recovery_92c55e0ac1b116e2c1edce480f35c96d` and protected release PR #7614.
- This documentation-only continuation is added **to the existing orchestrator-issued recovery branch**, preserving the original functional SHA as an ancestor.

## Why this owner-connected continuation is needed
The first-party orchestrator issued the recovery branch but reported `authentic_required_checks_not_green` on the GitHub-Actions-created head. Re-running authentic GitHub CI through an owner-connected documentation-only push is the repository-established recovery path. This note is not a forged receipt, approval, status check or deployment command. The existing orchestrated convergent-merge workflow remains the only protected merge authority, must verify the server-issued receipt, synchronize the actual current main and pass required CI.

## Reproducible acceptance
- Notification API tests: seven passing scenarios, including no-VAPID inbox subscription, consent and origin rejection, push upgrade/downgrade, topic isolation, and full unsubscribe.
- D1 additive migration guard: 220 migrations validated. No new schema mutation in this increment.
- Service-layer boundary check: pass. Full site build: pass.
- Production activation must retain Web Push default-off until properly configured. A working inbox subscription does not mean SMS, email or device push is live.
- Verify production `/notifications/` script and `POST /api/notifications/subscription` with `channel:"inbox"` under same origin; verify `GET /api/notifications/preferences` returns channel and scoped topics; verify `DELETE` deletes records.
- Real events require authorized first-party publishers. Until those producers are connected, inbox entries may remain empty. Never invent user consent or synthesize marketing notifications.
- A successful PR merge or staging build alone is **not** completion; official deployment, live API and privacy checks are required.

## Current-main synchronization and authentic check continuity
- The official recovery branch fast-forwarded to orchestrator-issued merge commit `0a8e129b12a5f39f5d67b9711e1c708eefa7f89b` (current main integration `4e2fafb69`). The functional source `92c55e0ac1b116e2c1edce480f35c96d7d4a45cd` is still a Git ancestor.
- On that synchronized branch, local notification tests were rerun: 7/7 passed and service-layer boundary validation passed.
- GitHub had not yet supplied authentic required checks to this newly generated merge commit. This second documentation-only change requests normal CI through the trusted owner-connected push. The orchestrator must still pin required checks to the *actual latest head*, not any earlier green source SHA.

## Independent approval boundaries
Do not directly merge source PR #7612 or deploy from this worktree. No manual production secret mutation, no authority bypass, and no positive live Web Push claim without a real-device receipt.
