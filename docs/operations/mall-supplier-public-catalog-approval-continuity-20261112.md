# EKODI Mall supplier public-catalog evidence gate — protected continuation

Date: 2026-11-12 KST. EKODI AI task [#9350](https://github.com/topmaster-joseph/ekodi-platform/issues/9350); EKODI Mail task [#6891](https://github.com/topmaster-joseph/ekodi-platform/issues/6891).

## Provenance and source

- Authenticated source authoring PR #9476, functional SHA `cfeade5f61692b4377f283d378cddb773a32c2eb`, superseded by **official EKODI Orchestrator** protected recovery PR #9477.
- Six runtime/test files, all scoped to `sites/ekodi-mall/**`. Existing Mall deploy workflow, direct-purchase scope and order/PII policies remain untouched.
- Source Mall validate [43159400140](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43159400140), source full CI [43159400192](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43159400192), and EKODI AI Orchestration Gate [43159400054](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43159400054) were all successful.

## Verified external API and email evidence

- Vendor reference `getItemList v4.1` official: https://docs.channel.io/domeggook_api/ko/articles/43780628 . It is a read-only Open API requiring an issued key; `market=dome/supply`.
- Vendor Open vs Private API rights guide: https://openapi.domeggook.com/ko/articles/OPEN-API-%EC%9D%B4%EC%9A%A9-%EB%B0%A9%EB%B2%95-bd7265d8 . Private API requests require separate approval, and there is no supplier sandbox.
- `ekodibiz@gmail.com` query through Nov 12 found no new technical reply after 2026-11-03; 2026-11-09 was training-only promotion. Follow-up owner-review **draft** updated in its existing thread to request third-party image/title/price display rights and rate limits, dropship and buyer PII terms, and `setOrder`/delivery-info syntax. **No email sent.** Previous source policy #6891 forbids sending absent owner review and explicit send request.
- Vendor Open API invocation right is **not** proof of third-party public catalogue syndication, resale contract, advertising images, or buyer PII forwarding approval. Keep each gate distinct.

## Fail-closed implementation

- The new `GET /api/public/supplier/status` only reports whether the existing catalog display rights flag, bounded-rate gate and vendor lookup config are set; it never fetches vendor products, exposes credentials or returns financial entitlements. It always returns `checkoutReady:false` and `autoOrderReady:false`.
- The Mall supplier connector admin UI visually separates operator-only authorized item lookup from visitor-facing catalog/publication approval; the approval/rate-limit prerequisites are explicit.
- Existing production `rights-unverified` must stay OFF until authentic vendor evidence arrives and the EKODI control plane processes it. No in-product admin self-approval, ad-hoc API credential insertion, paid pilot order, procurement, or customer data transfer.

## Authentic CI and release path

This **owner-connected documentation-only** commit on the existing official recovery branch requests authentic GitHub PR CI in place of bot-origin `action_required` placeholders. It is not a forged approval/check, a self-merge, an API-rights activation, or a deployment command. EKODI protected orchestrated convergence must verify exact source SHA ancestry and latest main, all required authentically executed checks, and only then merge. Stage and production run under official `EKODI Mall · Stage and Deploy` workflow. After deployment verify the live status endpoint reports `enabled:false, state:'rights-unverified', checkoutReady:false, autoOrderReady:false` and the authenticated connector UI differentiates the two scopes. No payment/order test needed or authorized.

## Financial restrictions

Domeggook 8,000 reward points were expired by Nov 9; 0P remained in signed-in readback. Separate prepaid e-money 50,000 KRW is not an approved substitute; **do not spend it**, transmit order PII, or turn on Auto Order during this release.
