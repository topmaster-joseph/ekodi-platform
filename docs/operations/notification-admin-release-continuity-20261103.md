# EKODI Notification Admin — official protected release continuation

Date: 2026-11-03 (Asia/Seoul).

## Exact source and recovery
- Authoring PR: #7758, superseded without direct merge.
- Functional source SHA: `2ec1a8cab130f808498124b616cee61ca0d32799`.
- Source base: `a927b541018761e4fd676a0057cba199ca047668`.
- Official Orchestrator task: `orch_recovery_2ec1a8cab130f808498124b616cee61c`.
- Official protected recovery PR: #7760, branch `ai/chatgpt/orch_recovery_2ec1a8cab130f808498124b616cee61c`.

## Why this non-executable commit exists
The official release-provenance recovery issued the protected PR but initially parked it for `authentic_required_checks_not_green`. An owner-connected documentation-only continuation requests fresh, authentic required GitHub Actions on the *already issued* official branch, preserving the exact original functional source as an ancestor. No release receipt, CI status, integration priority label or deployment authority is forged; no bypass or direct production mutation is attempted.

The original source passed notification and communication tests 11/11, full build, 220 additive D1 migration guards, service-layer boundaries and whitespace checks. These results do not replace latest-base protected CI.

## Production acceptance
1. Official workflow must synchronize latest `main`, confirm authentic required checks and protected merge.
2. Guarded Control API, shared admin Shell / static assets release must have actual successful receipts.
3. Anonymous, expired and site-admin sessions are denied at `GET /api/notifications/admin/summary` (no account/endpoint/body data leaks).
4. Super-admin can use existing Communication > Alerts tab to read only aggregated topic counts and refresh them on desktop/mobile without duplicate menus.
5. Existing public subscription, unsubscribe, per-topic consent and daily devotional availability remain operational.
6. Auto-publishing and Web Push stay disabled until separate guarded secrets/owner activation and real-device validation.

This report is not permission to merge a task PR, expose subscribers, or turn on live push delivery.

## Current-main synchronization follow-up
EKODI Orchestrator synchronized the official release branch with `main@fd33884fee632084c29f4d40ddddaa98f56077b1`, producing bot-authored merge `99e085e784b3c86e42f6ced18fe1330fc83d4fff`. Its pull-request check contexts appeared as `action_required`, which is not accepted as a real success. The previous owner-connected head `6f000f5151239adf77bd922f5e8ee8b37f46158f` passed 19/19 GitHub Actions checks, but those passes are from before synchronization. This additional documentation-only owner-connected push asks for authentic CI on the actual synchronized source tree and preserves all earlier source ancestry, receipts and guarded release requirements. No runtime change is introduced.

## Next authorized current-main CI recheck
After successful owner-connected CI on `6787451f7be0b074440772372cd4d65556b98a26` (all 19/19 workflows green), EKODI official protected convergence synchronized another independent main release, producing `32fbc748432aee54223aac3882177d852eb8a6ca` against `main@7d16cbd727210035a03dc6219be79ea8837cca38`. The original notification admin source SHA remains an ancestor, and no runtime change was introduced by this sync. The latest bot-generated check statuses must not be mistaken for authentic passing CI. This further docs-only commit requests new official checks while preserving first-party authorization and protected merge. Do not weaken release checks or directly merge this branch.
