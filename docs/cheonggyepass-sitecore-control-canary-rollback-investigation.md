# Shared Site Core guarded candidate and rollback canary incident — 2026-10-18

## Protected execution and independent evidence

- Human Gate-approved source PR [#5248](https://github.com/topmaster-joseph/ekodi-platform/pull/5248), SHA `9769f6082b5cfa63244562d101da5ef644b862be`; official recovery [#5252](https://github.com/topmaster-joseph/ekodi-platform/pull/5252), main merge `60f733bd82796467d33bce3325ec1fcfe209f6a3`.
- Official guarded release [run #39085370220](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/39085370220) **FAILED**. Mandatory staging and reliability gates passed, candidate deployed at **0% traffic** with baseline Worker at 100%.
- The candidate accepted many production and admin routes but rejected `https://ekodi.kr/control.js` on body marker `/api/control/ai/v8/pulse`, which the current `control.js` does not contain. Current `control.js` uses `/api/control/ai/v8/sovereignty/preview` and `/api/control/ai/assist`.
- Automatic rollback **deployed** stable Worker version `37f55bf7-2d5d-4f8d-891b-711ddb0a0f78` at **100%** (Wrangler SUCCESS), but full rollback verification failed at `https://ekodi.kr/pay`. **Do not say successful fully verified rollback or successful candidate promotion.**

## Root cause of Pay rollback-contract drift (historical stable version proven)

The stable version `37f55bf7-2d5d-4f8d-891b-711ddb0a0f78` corresponds to [successful Shared Site Core run #39057377028](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/39057377028), commit `9a4ab36a97623aa5442c6be7aa48cb8b870dc973` (2026-10-17).
Its original `platform-router-entry-worker.js` already routes **both** bare `/pay` and trailing `/pay/` as **HTTP 308 to `https://ekodi.kr/ekodipay/`**, with `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. There is no stable legacy `/pay/` page for that Worker.
The previous release manifest incorrectly expected **older, no longer deployed** rollback behavior: `/pay` 308 → `/pay/`, and `/pay/` 200 showing legacy title and former `x-ekodi-canonical-path` headers. The rollout failed verification even after Wrangler correctly reselected the stable Worker version.

## Scoped, non-relaxing correction

1. Replace only stale `/control.js` candidate body marker `/api/control/ai/v8/pulse` with actual `/api/control/ai/v8/sovereignty/preview`; retain status, other Control markers, and cache/security/route headers.
2. For both `/pay` and `/pay/`, **retain mandatory rollback verification** but assert actual stable **HTTP 308**, canonical **Location: https://ekodi.kr/ekodipay/**, **Cache-Control: no-store**, **X-Content-Type-Options: nosniff**. Empty response body is expected. This restores strict confidence against the historical stable Worker; it does not disable any rollback checks.
3. Update explicit source regression tests of the stable Pay contract in `test/education-site-core-payment-canary.test.mjs`, `test/canonical-surface-router.test.mjs`, `test/seonammedi-admin-release-manifest.test.mjs`, and `test/site-core-candidate-control-canary-drift.test.mjs`.
4. Preserve intact the Cheonggye Pass two `__name` canaries and their no-store/nosniff security headers. No user credentials, member/payments, D1/R2 vendor intake, or Google authentication implementation is changed.

## Release and QA

New exact-SHA owner Human Gate approval is needed for this PR. Do not merge or deploy through an unofficial branch. Require latest main, CI, formal EKODI recovery, protected merge, isolated staging, 0% candidate verification, verifiable rollback protection and 100% promotion evidence. After successful deployment, repeat first-party EKODI Chromium PC/mobile at `/cheonggyepass/admin` to verify zero `__name is not defined` page errors. Only authorized real Google accounts with actual R2/D1 persisted data, vendor isolation and admin review can prove full live operational CRUD.

Related [Cheonggye Pass issue #5238](https://github.com/topmaster-joseph/ekodi-platform/issues/5238).
