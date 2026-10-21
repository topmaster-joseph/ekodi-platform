# EKODI Mall affiliate connection migration and legacy retirement gates

Status: migration in progress; legacy repository must remain read-only until all gates pass.

## Canonical ownership
- Source: `topmaster-joseph/ekodi-platform/sites/ekodi-mall`
- Deployment: `.github/workflows/deploy-ekodi-mall.yml`
- Legacy: `topmaster-joseph/ekodi-mall` (read-only, no deployment)
- Account inventory: Coupang Partners (owned), Agoda affiliate (owned), YouTube (owned). Ownership is not an active OAuth/API connection.

## Migration checklist
- [ ] Inventory legacy Coupang, Agoda, YouTube, affiliate reporting, social OAuth, scheduling, webhook and secret references; map each to canonical module or documented non-migration decision.
- [ ] Confirm provider approval and API availability, including permitted automation scope, for each account.
- [ ] Implement centralized connection registry with tenant/site scoping, provider ID, masked account ID, OAuth/API capability, permission scopes, status, expiry, last health check, audit trail, and enable/disable.
- [ ] Keep tokens in managed encrypted secrets; never commit credentials, expose callback codes in URLs after exchange, or transmit credentials to third-party AI.
- [ ] Implement provider-specific connection and revocation, token refresh where available, idempotent retry with backoff, and rate-limit-aware health checks.
- [ ] Validate affiliate link attribution, disclosure requirements, reporting reconciliation, and no fabricated conversions/revenue.
- [ ] Test YouTube authorization in sandbox/test channel before publishing; user approves the first external account consent.
- [ ] Run unit, contract, integration, and staging tests, including callback failures, expired credentials, cross-tenant isolation, and provider outages.
- [ ] Validate production deployment SHA, route response, connection health, and end-to-end attribution/operations with redacted logs.
- [ ] Obtain export/backup evidence for legacy data and verify parity for retained features.
- [ ] Confirm legacy has no production traffic, active secrets, webhooks, schedules, or unique data for a defined observation period.
- [ ] Only then prepare a separate explicit deletion decision for the legacy repository and related resources; do not delete before verified cutover.

## Safety
External posting, purchases, paid ads, payouts, destructive deletion and production secret rotation require their respective authorization and validation. A transient provider error must not stop unrelated channels. Do not bypass mandatory security checks.
