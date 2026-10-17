# EKODI Research route activation after approved asset fix

## Evidence and authorized scope
- User Human Gate approved original Research Worker fix #5129 at `504da350bf09532f9f25b2982676743c2f5aaa93`.
- Official recovery PR #5131 merged into main as `748bbafba3b75d6ac99ede6578dcec3782c604ce`.
- Education Worker protected production release run [39017953630](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/39017953630) passed.
- Site Core's prior guarded candidate run [39016637786](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/39016637786) failed on Research HTTP 307 and rolled back; a separate `/pay` rollback-verification issue remains unresolved. Site Core is not yet updated.
- Live browser still showed pre-existing 운영공간 at `https://ekodi.kr/research/` after Education Worker release.

## Narrow follow-up to invoke already governed Site Core path
- The existing release manifest currently has canaries for `/research/` and `/research/health`.
- Add two additional read-only, HTTP 200 candidate canaries to ensure the Research `/research/app.js` and `/research/app.css` assets route from the **same canonical hostname** without redirects.
- Update associated assertions. No changed shared routing logic, secrets, storage, payments, authentication or deployment scripts.
- This change to `deploy/manifests/shared-site.worker.json` is already recognized by the orchestrator's guarded `sharedSiteTouched` protected release trigger, allowing the fixed Education Worker to be validated under Site Core without an unsafe manual or stale workflow rerun.

## Gate
No release is authorized by old PR #5129 comments for this **new code revision**. Obtain a fresh exact SHA owner Human Gate before enabling official release provenance recovery, rerunning CI/staging/guarded deploy and genuine PC+mobile Chromium Research checks.

Never bypass `/pay` rollback verification; report that independent baseline discrepancy to the EKODI release owner. Don't claim a completed Research launch until the canonical page, health API, JS/CSS asset canaries and native device verification are all confirmed.
