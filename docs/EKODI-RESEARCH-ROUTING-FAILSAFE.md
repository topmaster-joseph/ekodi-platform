# EKODI Research — Canonical routing failsafe and release trigger

## Incident
The user provided a real Opera browser screenshot showing `https://ekodi.kr/research/` with **내 운영공간**, despite merged Research source and an Education Worker protected deployment. The live Site Core routing worker is stale after prior guarded candidate #39016637786 rejected HTTP 307 and rolled back.

## Minimal source-bound corrective action
- In the **existing** `canonical-surface-router.js`, add a fail-closed check for the reserved Research root and descendant paths after the execution-surface resolver. With a current registry this never triggers; the correct `EDUCATION` binding continues to receive the original `/research/` path. If a future registry omits the route, the request returns HTTP 503 rather than leaking into another tenant's workspace shell.
- Add actual Node request/response tests for `/research/`, `/research/health`, `/research/app.css`, exact URL query preservation, canonical headers and missing-binding rejection.
- The official merge convergence already recognizes `canonical-surface-router.js` as a protected Site Core release input; this change will request a fresh guarded Site Core deployment **without touching** the shared manifest or workflow changed concurrently by seasonal workforce PR #5130.
- Existing Research homepage, health and native desktop/mobile canaries remain in `main` unchanged; they MUST pass. No credentials, payment, private data, AI or additional services are enabled.

## Required gates
This is a **new exact SHA** requiring its own Human Gate. Do not infer approval from prior PRs #5091, #5125 or #5129. Official orchestrator must verify parallel changes, required CI, protected staging, canary, rollback, guarded merge/production release, native PC/mobile Research behavior.

## No success claim
No operational completion until `https://ekodi.kr/research/` serves EKODI Research, `/research/health` reports foundation, and the two native browser Research checks have verified success. Existing `/pay` rollback marker discrepancy in earlier run remains a separate unwaived issue.

## Official recovery CI evidence restart (2026-10-17)
- Source-approved PR #5134 at immutable SHA `86b967eca2fd720926bcda2176aba3d86e146665` by GitHub owner `topmaster-joseph`; exact comment [#6232163905](https://github.com/topmaster-joseph/ekodi-platform/pull/5134#issuecomment-6232163905) preceded the Human Gate label.
- Official provenance task `orch_recovery_86b967eca2fd720926bcda2176aba3d8`, protected recovery PR #5136.
- Bot-triggered PR events displayed `action_required`; this owner-authored **documentation-only** update requests normal verifiable CI against the official recovery branch. There are no application or policy modifications in this update.
- Production release requires actual successful CI, guarded merge, required Site Core deployment, rollback and separate Research-specific real desktop/mobile verification. Do not infer completion from the documentation update.

## Official main-synchronization check renewal
- The verified official recovery head `dd68e50e7a38b8cff13770dcb375e66b377dea9c` passed all checks, then the EKODI convergence bot synchronized it to protected main, creating `5f2a806afb33dd69c14893e61828a6041d19f65f`.
- GitHub bot-produced pull request check runs returned `action_required`. This owner-authored documentation-only commit re-triggers real checks for the synchronized source. No executable code, approval marker, new privileges or rollback controls are changed.
- Original owner Human Gate is tied to PR #5134 exact SHA `86b967eca2fd720926bcda2176aba3d86e146665`; task `orch_recovery_86b967eca2fd720926bcda2176aba3d8`. Protected merge and on-host Research tests remain mandatory.
