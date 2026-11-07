# EKODI Native Browser — protected Agent 2.6.4 release continuity

Date: 2026-11-07 (Asia/Seoul)

## Provenance and purpose

- User authorization: continue EKODI-owned browser and Agent reliability implementation within EKODI Orchestrator governance.
- Original task PR #8700, source commit `ce76f1fea4ec8c9591c02e549ad6b6722e5ed2c9`; superseded source PR closed, **never directly merged**.
- EKODI Orchestrator's official recovery PR #8703, branch `ai/chatgpt/orch_recovery_ce76f1fea4ec8c9591c02e549ad6b672`.
- The original functional source commit is an ancestor of this recovery branch. No change to the approved production code is made by this documentation.
- Recovered work: Agent 2.6.4 bounded download (`-TimeoutSec 25`), uniquely named temporary candidate, `finally` cleanup, `Assert-AgentCandidate`, transactional rollback and post-restart heartbeat gate. Security tests now **exclude comment lines** from executable-only privilege checks while verifying real RunAs/Bypass examples would be detected.

## Authenticated CI continuation

The source SHA passed: base CI #42377517486; Windows Device Control CI #42377517464; Device Agent Production Verification #42377517478; Constitution #42377517453; Parallel Change Conflict Guard #42377517487 (rerun after obsolete overlapping PR #8582 was closed); Orchestration Gate #42377517489; Supabase, Security, Distributed Runtime and Domain Guard.

First-party EKODI Orchestrator issued the recovery PR but parked at `authentic_required_checks_not_green` because the GitHub-Actions-created recovery head was not accompanied by every required authentic status. This owner-connected, **non-executable documentation** update requests normal GitHub PR checks on the existing official recovery branch; it is not a fabricated CI result, signed release receipt, synthetic approval or deployment command. Re-run exact-head checks for the **latest HEAD after this commit**, do not transplant statuses from the original source SHA, and preserve the centrally guarded release path. This update does not authorize or perform merging to `main`.

## Operational boundary

- EKODI-owned Chromium/Playwright runs without TinyFish subscriptions, browser profile imports or external paid provider fallback.
- Existing Agent users have **not** been proven upgraded to 2.6.4. Old live self-update attempt failed `EKA-121` and requires normal local PC authorization; do not bypass Windows approval, force remote install, duplicate a payment or transfer customer PII.
- The Agent auto-update release manifest remains absent pending protected release and real device canary. An installed 2.6.4 agent requires a fresh version-matched heartbeat after restart; a CI pass is not proof of a real device update.
- Post-merge acceptance: staged and production release receipts where applicable; real device agent version + heartbeat; browser read-only canary; and an auditable rollback path on failure.

## Latest-main synchronization verification (second authentic check pass)

At 2026-11-07 KST, the first owner-authenticated recovery HEAD `044b18c063a00673a686474fb504759102af871c` passed all 11 authentic required checks, including full CI and Windows Agent contract. Subsequently central main gained a separate Seonam Medi board change; the recovery branch synchronized main again, yielding merge commit `e7cecd823fa13daca07bb427ca65929b62d6a8a4`. A green check from the earlier HEAD must **not** be transplanted or forged for this new merge commit. This second documentation-only commit requests checks on the new exact HEAD; it does not change runtime or grant merge/deploy authority. EKODI's authentic protected CI, release-provenance validation and central orchestrator remain decisive.
