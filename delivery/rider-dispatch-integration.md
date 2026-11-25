# Multi-store rider workspace (draft, not deployed)

Canonical route proposal: /delivery/riders, linked from existing /delivery. Central EKODI identity only; a rider logs in once, store managers grant/revoke access separately per store. No shared POS passwords, personal browser automation or copied session tokens. Never use browser-local data for shared dispatch.

## Required before activation
- Integrate existing store registry and verified store-manager roles; use durable server-side membership records and validate active account and store grants on every request. Do not seed real shops or people in public source.
- Persist provider/store/external-order ID with a unique constraint. Use a transaction that locks/rechecks membership and atomically applies the core's expected store, ID, status, version and rider predicates. Require one affected row, append audit event in the same transaction; otherwise conflict/reload. Add idempotency key for retries.
- Rider list shows authorized stores, ready orders and own work; expose minimum delivery contact/address only to assigned rider where authorized and needed, with retention/access logging; omit sales and settlements. Admin provisioning, release/reassignment and revocation need separate permissioned workflows.
- Mobile list: all authorized stores / individual store / ready / my deliveries / completed; claim, pickup, complete, release; update on polling or authorized realtime; explicit connection/stale indicator; no offline success.
- Official MATE partner adapter only, per-store authorization and server-side secret storage. Verify official API contract, read/write scopes, signature/replay protection, provider reconciliation and acknowledgements. No external mutation before approval and verified adapter. Manual authorized entry is a separate source and must never be represented as synced.
- Stage with synthetic stores and riders. Test simultaneous claims against actual DB (one winner), revocation, cross-store access, admin grants, duplicated provider event, outage, retry, assignment privacy, mobile layout and login return. Run CI, protected staging, merge and canonical production checks before enabling.
- Current commit provides pure transition planning and tests only; it has no production endpoint or UI and does not replace database authorization. Keep feature disabled until above gates pass.
