# EKODI Logistics — Phase 1 (2026-11-02)

Task ID: `ekodi-logistics-phase1-20261102-1346`

## Scope and constitutional boundary

This is an extension of the already operating EKODI Mall sourcing and fulfillment **capability**, not registration of a new customer-facing service or deployment unit. Reuse the single repository, independent guarded deployment lanes and existing authentication. Seller membership is checked server-side. Platform super-admin does not automatically receive seller-private data.

The seller-facing read-only cockpit lives at `/ekodimall/fulfillment?tab=logistics`. It projects the current seller's **latest 100** fulfillment rows into shipping, return and attention counts and planned supplier obligations. It does not aggregate other tenants, fetch raw delivery PII, transmit orders to carriers, pay suppliers or process refunds.

## Phased rollout / approvals

1. **Implemented candidate:** seller-specific read-only operations dashboard, state counts, operational gate visibility, no buyer PII. No database migration.
2. **Next work package:** common capability contract (workspace_id scoped), site administrator per-site opt-in and capability registry, adapter health monitoring, courier tracking-only integrations when contractual terms and API scopes are verified.
3. **Pilot:** up to 5–10 consenting stores/farms; validate supplier terms, data-processing and delivery-service contract; measure price, cost, exception response, return SLA and loss.
4. **Deferred (OFF by default):** live order creation, buyer PII release, courier booking, payouts, refunds, external subscriptions and physical logistics facilities. Each requires current permissions, reviewed contracts, financial/legal controls, staging tests and gated release.

New distinct service registration must pass the capability-first governance sequence (gap analysis → Foundry/sample validation, at least 3 distinct verified synthetic runs → measured demand → super-admin packaging review). The owner's strategic direction does not override these promotion requirements.

## Acceptance

- `node --test sites/ekodi-mall/api/logistics-overview.test.mjs`
- `node --test sites/ekodi-mall/test/fulfillment-layout.test.mjs`
- `npm --prefix sites/ekodi-mall run check`
- PR orchestrator gate; do not merge task branch directly. Only orchestrator-issued release path may deploy.
- After guarded release, verify authenticated seller state on production URL and 390/768/1366 viewport behavior, tenant isolation, last-100 notice, logout clearing, and API response without buyer PII.
