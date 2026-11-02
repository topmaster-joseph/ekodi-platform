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

## Phase 2: operational attention triage (2026-11-02)

Task ID: `ekodi-logistics-attention-20261102-1523`.

Using only the authenticated seller's existing fulfillment projection, the read-only logistics cockpit now presents a bounded **처리 필요 목록**. Actions are text-only guidance for `failed`, `cancel_requested`, `return_requested`, `refund_pending`, `awaiting_pii` and `ready_to_forward`. No new endpoints, cross-workspace query, raw recipient data, courier accounts, automatic order mutation or external commitments are introduced.

- Server produces a strictly allowlisted `attentionQueue` (status, safe identifier, priority, translated state and fixed operator advice) with a maximum of 20 entries. Priority is deterministic: failure first, then cancellation/returns/refund, then approval/forward readiness.
- All counts are scoped to the latest 100 fulfillment records; a warning indicates sample truncation. Queue overflow also has a notice.
- Client builds DOM text nodes only and clears the list on logout. On an empty seller account it presents a plain empty state.
- Manual operational decisions remain with the authenticated seller and existing separate approval gates.

Next governed milestone is a reusable workspace-scoped read-only tracking contract and explicit site-specific opt-in. No automatic courier API connections will be enabled before validated credentials, vendor contract, personal data processor authorization, staging simulation and a guarded release.
