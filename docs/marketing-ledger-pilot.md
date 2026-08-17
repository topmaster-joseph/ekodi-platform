# EKODI Marketing Event Ledger Pilot

## Purpose
One central event/campaign contract powers multiple Marketing AI workspaces without copying a CRM per customer.

## Pilot scopes
- `tenant:ekodibiz` → `service_b2b`
  - inquiry → consultation → proposal → contract → onboarding → active → renewal
- `store:4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa` → `food_b2c` (자담치킨 목포대점)
  - first_visit → order → repeat_order → coupon_redeemed → review → dormant → reactivated

## Privacy boundary
- Raw name, phone and email are not persisted in the Marketing Event Ledger.
- An incoming customer reference is normalized in memory and transformed into a salted SHA-256 pseudonym unique to the workspace.
- The administrator CRM endpoint returns aggregates only and does not return the pseudonymous customer key.
- Arbitrary event metadata is not accepted in the MVP. `metadata_json` is stored as `{}`.

## Campaign boundary
- Campaigns begin as `draft`.
- Requesting review creates an `ai_agent_actions` record with `decision_tier=human_gate` and `status=awaiting_human`.
- This module provides no publish, send, execute or approve endpoint.
- External execution remains a separate governed action after human decision.

## Source adapters
The ledger is source-agnostic. POS, owned-order, QR, coupon, review and consent adapters should map source records to the event contract and use a stable `external_ref` for idempotency. No synthetic pilot activity is seeded.
