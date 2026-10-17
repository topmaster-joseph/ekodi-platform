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
