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
