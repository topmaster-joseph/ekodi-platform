# EKODI notification tenant scope expansion — 2026-11-03

## Evidence and scope
Read-only inspection of the authorized production Supabase registry confirmed:
- `ekodi-church` is an active church tenant with the server `site_key=church`.
- `ekodimission` is an active mission tenant with the server `site_key=mission`.
- `cheonggye` is an active association tenant with the server `site_key=cgma`.
- `ekodimall` is an active business tenant with the server `site_key=mall`.
All four have `operating_model=customer-site` and server-issued administrator records. This task makes no modification to Supabase users, RLS, access registry, or database data.

The read-only notification API now recognizes `cheonggye + cgma -> community` and `ekodimall + mall -> mall` in addition to church and mission. Tenant slug, site key, authority scope `tenant`, `customer-site` operating model, non-empty tenant ID and approved management role must ALL match the Supabase authenticated RPC response. Only explicitly mapped pairs authorize a site. A wrong pair, inactive login, site viewer, phone-only confirmed email, unknown service or failed provider call is denied.

The existing tenant **서비스설정** panel shows its own notification counters for `/cgma/admin/services`, `/cheonggye/admin/services`, and the standalone `/ekodimall/admin/services` route (as well as church and mission). The latter uses `mall` routing because its workspace UI uses the `ekodibiz` base internally. Rendering a topic client-side does NOT grant server access. The common admin remains the separate platform-super-admin surface.

## Non-goals and release checks
The education, books, and seonammedi topics have no confirmed production customer-tenant identity mapping here and remain inaccessible to site managers by design. Users can still subscribe to the existing public inbox topics. No push, publishing, email, SMS, paid messaging or credentials are activated by this change.

Before deployment: run all five notification/admin tests, full build, service layer boundary checks, additive migrations and current-main protected CI. EKODI Orchestrator must issue the official `orch_recovery` PR and handle merge/deployment. Verify the production APIs, the two new tenant admin service settings pages, anonymous 403, cross-topic 403 for real scoped sessions and that private device tokens never appear in counters. Do not label this feature fully accepted solely from an HTTP 200 or source test.
