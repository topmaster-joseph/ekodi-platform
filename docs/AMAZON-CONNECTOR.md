# EKODI Amazon Connector

## Canonical surfaces
- Platform policy: shared external connector; no new EKODI subdomain
- Mall administrator: `/ekodimall/admin/amazon`
- Mall API: `/api/amazon/status`, `/api/amazon/capabilities`, `/api/amazon/sync`

## Seller Central credentials
Configure these as server-side secrets/variables in the Mall API runtime:
- `AMAZON_SP_API_CLIENT_ID`
- `AMAZON_SP_API_CLIENT_SECRET`
- `AMAZON_SP_API_REFRESH_TOKEN`
- `AMAZON_MARKETPLACE_ID`
- `AMAZON_SELLER_ID`
- optional `AMAZON_SP_API_ENDPOINT`

The browser must never receive client secrets or refresh tokens.

## Optional AWS connection
AWS is a secondary capability, not the EKODI primary platform:
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

Use AWS only when a workload materially benefits from S3, SES, SQS, Lambda, backup or another specific AWS service.

## Optional Amazon Pay
- `AMAZON_PAY_PUBLIC_KEY_ID`
- `AMAZON_PAY_PRIVATE_KEY`

## Fail-closed rule
Until the verified live SP-API execution adapter is enabled, `POST /api/amazon/sync` never performs an external mutation. Missing credentials return `409 AMAZON_SETUP_REQUIRED`; configured-but-not-enabled execution returns `501 AMAZON_LIVE_SYNC_NOT_ENABLED`.

## Planned live adapter scope
1. catalog/listings
2. pricing
3. inventory/FBA
4. orders
5. fulfillment
6. reports/settlement

Each resource must preserve tenant scope, audit external mutations, support retry/idempotency, and remain independently disableable.

## Verification
- PR CI must pass the repository CI and constitution checks before merge.
- Production activation requires the canonical `/ekodimall/admin/amazon` route verification.


## Free-first cost governance
The default policy is fail-closed for paid Amazon/AWS capabilities.

- free-first: enabled
- monthly paid budget: USD 0
- auto-stop threshold: 90%
- paid AWS: disabled
- Seller paid plan: disabled
- FBA: disabled
- paid Bedrock: disabled

The Mall admin surface `/ekodimall/admin/amazon` displays the normalized usage snapshot, free allowance remaining when known, and estimated monthly cost.

Cost-control API:
- `GET /api/amazon/cost-policy`: read current policy/dashboard
- `PUT /api/amazon/cost-policy`: operator-only policy update
- `POST /api/amazon/usage`: operator-only normalized usage snapshot ingestion
- `POST /api/amazon/approvals`: operator-only paid-feature approval with a bounded USD limit

A paid-feature switch does not by itself authorize spending. A currently valid feature approval and a non-zero monthly budget are also required. If cost data is unavailable, paid execution remains blocked.

The policy engine classifies execution into levels 0-5: free only, free tier, credit, micro-paid, monthly-paid, and persistent-paid. Live SP-API mutation remains separately disabled until the production adapter gate is explicitly enabled.
