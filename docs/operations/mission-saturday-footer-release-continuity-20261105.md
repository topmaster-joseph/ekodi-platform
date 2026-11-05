# EKODI Mission — Saturday copy and footer traffic spacing release continuity

Date: 2026-11-05 (Asia/Seoul)
Task: `mission-saturday-footer-spacing-20261105`

## Immutable source and official recovery
- Original owner-authorized source PR: #8252, closed as superseded (not merged).
- Source SHA: `7569901929fafba97a89fa2a1f6a249ece4b90aa`.
- Source base: `35014fcc830907a474bf5338f4c1b098175bed9c`.
- EKODI Orchestrator issued official recovery PR #8253 and task `orch_recovery_7569901929fafba97a89fa2a1f6a249e`.
- This documentation-only continuation is on that official branch to request **authentic** GitHub Actions checks after bot-origin checks returned `action_required`. It does not forge a receipt, bypass a protected check, change runtime behavior, or directly merge or deploy.

## Requested functional change
1. Remove the explanatory paragraph under this/next Saturday meeting title.
2. Remove the duplicate "매주 토요일" badge in the date banner while keeping canonical date/time and optional participation.
3. Prevent JavaScript from repopulating the deleted copy for one-off 17:00 meetings.
4. Increase horizontal space between the three public traffic metrics and place the UTC note on a separate line; preserve wrapping without horizontal page overflow.

## Verification and protected release acceptance
- Source static regression tests and mission history tests: 5/5 passed on 2026-11-05.
- `node --check` passed for Saturday JS and shared footer JS.
- Genuine required checks must pass on **the latest official recovery head** and then current-main convergence must preserve exact source ancestry.
- Guarded deployment of both EKODI Operating Space and shared Shell should be confirmed before live claims.
- Verify real `https://ekodi.kr/ekodimission` on guest mobile and desktop at 320/390/768/1366/1440 px: no duplicate phrases, no horizontal overflow, correct canonical meeting date/time and form behavior.
- Verify footer metrics spacing and note wrapping at the canonical hostname, not only static source inspection, and confirm relevant JS/asset responses and no unexpected production errors.
- Save task id, source/official head SHA, authentic CI, guarded deployment, production functional checks, observability and verification time as an official completion receipt.

This file requests the repository's established owner-connected CI renewal on the official recovery branch; it grants no new production authority and changes no runtime or security controls.
