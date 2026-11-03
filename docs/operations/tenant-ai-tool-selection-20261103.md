# EKODI AI Tool Selection — Protected Tenant Extension

**Task:** `ai-tool-site-policy-20261103` · EKODI Orchestrator / ChatGPT worker.

## Reuse, not duplication

- Site-local menu composition already exists at `/{site}/admin/services`; the AI-tool list is a nested panel under its existing **AI·콘텐츠** category. No separate sidebar, header, login or parallel admin route.
- AI provider secrets, provider health, capability routing and paid API approval remain exclusively within the platform AI Operations Center.
- Tool rows reuse the twelve curated `TOOL_DIRECTORY` IDs already shown on the platform AI Operating screen. The database is authoritative for site candidate selection; the platform registry is a discovery projection.

## Authority and safety

- `tenant_ai_tool_catalog` is platform-maintained reference metadata.
- `tenant_ai_tool_preferences` holds independent per-tenant selection flags, default `false`.
- `tenant_ai_tool_audit` records real changes with actor and time.
- Both RPCs cross-check `current_site_activity_contexts()` with exact tenant UUID and an existing site administrator role; a member, another tenant or anonymous caller cannot read or mutate the protected rows.
- RLS enabled; direct table API permissions revoked for `anon`, `authenticated` and `service_role`.
- The selection flag is **NOT** runtime entitlement, billable service activation, credential availability, task execution, publication or automatic provider integration. Existing authorization / Human Gate / provider guards remain intact. External reference-only tools can be selected as future candidates without calling them.
- RPC unavailable: site menu setting remains available, AI tool panel shows an error, and no local fallback pretends to persist settings.

## Guarded schema rollout

1. Source task PR is not merged by the worker. EKODI Orchestrator issues a provenance-correct recovery PR.
2. Required PR checks and Supabase Local CI apply the migration to an isolated database first.
3. The current `deploy-tenant-site-service-schema.yml` lane pins **both** existing service schema and new AI-tool schema blobs. Only the canonical post-merge convergence on exact protected `main` triggers the promotion.
4. Promotion verifies EKODI orchestrator receipt, exact branch/task and SHA; checks prerequisites on both dev and production; applies the reviewed SQL to **dev first**, validates catalog count, RLS, revoked direct table permissions and RPCs; repeats for production.
5. The shared site release is guarded separately. Confirm active administrator sees twelve candidate rows; toggles persist only on its tenant; another tenant's state is unchanged; revoked/unauthorized users cannot mutate; mobile reflow works at 320/390/768/1366/1440.
6. No production completion claim without schema release proof, guarded site deployment, browser validation and role-scoped functional verification.

## Known limitation

This phase implements **candidate selection, not actual site-specific AI runtime execution entitlements**. Per-tenant AI invocation authorization requires a separately reviewed runtime permission contract that reads these site choices alongside the provider's connection status and cost policy. No new remote API is silently enabled by this feature.
