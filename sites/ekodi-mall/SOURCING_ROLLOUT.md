# EKODI Mall Sourcing Rollout

## Phase 1 · External reference / affiliate

- General retail marketplaces such as Auction are reference or external-checkout sources.
- EKODI stores only seller-entered source URL, internal label, optional source reference, and operational cost/stock snapshot.
- Do not persist copied marketplace images, descriptions, or API catalog payloads without explicit rights.
- No buyer PII is sent to a general marketplace by the sourcing engine.

## Phase 2 · Contract supplier dropship

- Supplier contract must define supply price, inventory/price refresh, fulfillment SLA, returns, CS responsibility, and buyer-data handling.
- New suppliers start `contract_pending` and cannot self-approve.
- After internal approval they may become `manual_contract` with `contracted_processor` PII permission.
- Initial fulfillment remains manual-forward, not unattended auto-order.

## Phase 3 · Auto Source dry-run

For each EKODI product + linked source, the server evaluates:

`contribution = sale price - EKODI transaction fee - source cost - shipping cost`

The engine also checks stock, contract/rights status, buyer-data permission, order permission, per-product minimum margin amount/percent, and priority. It selects only an eligible source and records an auditable procurement decision. No order is sent.

## Phase 4 · Approved API auto-order

Auto-order stays OFF until all of the following are true:

1. supplier-specific official order API/contract is verified;
2. source has `api_approved` order permission;
3. buyer-data processing is contractually approved;
4. provider-level `auto_order_enabled` is on;
5. environment `SOURCING_AUTO_ORDER_ENABLED=true` is on;
6. idempotency, cancellation, failure/retry, stock/price recheck, shipment/tracking and return tests pass in staging.

Retail-account browser automation, password storage, scraping, or silent consumer-account purchases are not an accepted production path.
