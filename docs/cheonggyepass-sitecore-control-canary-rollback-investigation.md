# Shared Site Core guarded candidate rollback incident — 2026-10-18

## Evidence

- Official source approval: [#5248](https://github.com/topmaster-joseph/ekodi-platform/pull/5248), exact SHA `9769f6082b5cfa63244562d101da5ef644b862be`; official recovery [#5252](https://github.com/topmaster-joseph/ekodi-platform/pull/5252), protected merge `60f733bd82796467d33bce3325ec1fcfe209f6a3`.
- Guarded Shared Site Core release: [run #39085370220](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/39085370220), **FAILURE** during 0%-candidate verification. Staging and reliability gate passed.
- The candidate (0% traffic) verified seasonal-worker paths, admin/control, Control CSS, but rejected the next `https://ekodi.kr/control.js` request because manifest required `/api/control/ai/v8/pulse`; canonical first-party `control.js` now invokes `/api/control/ai/v8/sovereignty/preview` and `/api/control/ai/assist`, not the retired `pulse` marker.
- Automatic rollback command returned **SUCCESS deploying the preexisting Worker version `37f55bf7-2d5d-4f8d-891b-711ddb0a0f78` at 100%**. However, the subsequent rollback verification failed on `https://ekodi.kr/pay`: expected **legacy stable** `Location: https://ekodi.kr/pay/`, actual response did not contain it. Thus **rollback deployment is confirmed, full rollback verification is NOT confirmed**. The release workflow exited FAILURE. Do not claim normal production promotion, nor full verified rollback.
- No later control-route verification or new Cheonggye Pass script proof was completed in that failed workflow.

## Narrow correction

Change **only** the `https://ekodi.kr/control.js` guarded candidate body marker from stale `/api/control/ai/v8/pulse` to `/api/control/ai/v8/sovereignty/preview`, retaining other route/headers/status checks.

Add test `test/site-core-candidate-control-canary-drift.test.mjs` that locks the marker to actual `control.js`, preserves both Cheonggye Pass `__name` canaries and expressly keeps the strict Pay **legacy stable rollback** expectations: bare `/pay` 308 -> `/pay/`, trailing slash `/pay/` 200 + original path marker. Do **not** relax, remove, bypass, or rewrite Pay rollback contracts merely to greenwash the release. The newer canonical production Pay destination `/ekodipay/` is separately required.

## Follow-up

1. Run full source CI & protected EKODI AI orchestration/human gate, no bypass.
2. Require independent investigation of the Pay stable rollback verification failure and preserve old Pay route semantics or prove the issue is only probe/edge transience. No unauthorized direct Worker promotion.
3. After a **new exact-SHA owner approval** and official protected merge, rerun guarded release; report result by actual workflow and verified 100% promotion status.
4. Run first-party Chromium on real `/cheonggyepass/admin` PC and mobile. Show no `__name is not defined` and enforce login original return path. Actual Google user authentication and PR/ZIP/API real R2/D1 save/administrator review require separate operational evidence.

Related tracked operational QA: [issue #5238](https://github.com/topmaster-joseph/ekodi-platform/issues/5238). No customer, vendor, member or payment data changed here.
