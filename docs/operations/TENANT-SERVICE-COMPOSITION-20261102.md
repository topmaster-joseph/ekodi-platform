# EKODI Site Service Composition — Task tenant-service-selection-20261102

## Scope

The site-local admin page `/{site}/admin/services` renders the common 12-category, 32-item service catalog from Supabase. The same shared workspace admin component covers supported tenant routes, including `/cgma/admin/services` and `/ekodimall/admin/services`. Actual availability on a particular dedicated admin surface requires post-release checks; routes outside the shared workspace admin runtime are not claimed covered.

Only a local site administrator with the existing `tenant.site.manage` capability can see and change site menu preferences. This is **menu visibility**, not service entitlement or runtime enablement. Existing per-service API authorization and approval gates still apply. Disabling a menu never destroys data or disables queued jobs; enabling a menu never starts payments, broadcast, automatic publication, or external integrations.

## Data contract

- `tenant_site_service_catalog`: platform-owned feature-list metadata and readiness.
- `tenant_site_service_preferences`: independent per-tenant menu visibility, defaults to visible for supported sections.
- `tenant_site_service_audit`: immutable audit entry for changed selections.
- Both read/write go through Supabase authenticated RPCs that re-evaluate `current_site_activity_contexts()` against the requested immutable tenant UUID.
- No direct table access is granted to `anon` or `authenticated`; RLS enabled on all three tables.
- An item with status `setup_required` or `planned` is read-only (not active despite a possible inherited default preference).
- When RPC is unavailable, existing administrator nav remains intact; the configuration screen shows an error rather than pretending settings were saved.

## Deployment sequence

1. Review the SQL migration and validate tenant isolation with Supabase migration CI.
2. Apply the migration through the guarded database promotion lane **before** the shared site runtime is released.
3. Deploy the shared site Worker only through EKODI Orchestrator and its release provenance gate; never merge this task PR directly.
4. Verify `/{site}/admin/services` for at least a church/community site, CGMA, and the mall with an authorized site manager and an unauthorized operator.
5. Toggle `publishing` or `finance` menu visibility in one test tenant; confirm it persists after refresh, changes only that tenant, retains existing data and never grants a new API capability. Confirm a user without `tenant.site.manage` cannot mutate preferences.
6. Verify 320, 390, 768, 1366 and 1440px viewports, exact login route return, error states, and no horizontal overflow.
7. Record receipt: task ID, deployed SHA, migration version, tenant IDs (redacted), URLs, role/device/browser checks, logs and timestamp.

## Remaining independent work

For site types with dedicated admin implementations rather than the shared workspace-admin shell, this menu must be projected from the same catalog and same RPCs by an authorized change. Enabling or disabling actual backend service execution requires a separate scoped entitlement/operational control integration and review. Do not represent visibility configuration as engine activation.


## Stabilization checkpoint — 2026-11-04 (TENANT-PRESET-ADVISORY-001)

- Existing shared site managers receive **read-only site-type menu recommendations**, computed exclusively from their tenant's current 32-item service catalog snapshot and `readiness='ready'` entries. No recommendation changes a selection, entitlement, account connection, billing or authorization. Unknown site types receive no presumed profile.
- Both menu projection and preset recommendation helpers must be injected into the generated `workspace-admin.js` browser runtime. Merely exporting the helpers from the source module is insufficient because the runtime serializes `renderTenantServiceAdmin` with `.toString()`. Test the **generated script**, not only a pure source helper.
- On 2026-11-04 the connected production and development Supabase `public.tenants` returned no `slug` matching `books`, `ekodibooks`, `cmpmyi`, `jadam`, `pizzamaru` or `yogurt`. The production `site_access_registry` also returned no `site_key` matching these names. This is a **read-only inventory**, not proof that the services have no other canonical workspace identity.
- `/books/admin` is currently owned by the platform Books admin handoff; `/cmpmyi/admin` is a three-store portfolio owned by a separate runtime. Do not automatically create tenant UUIDs, synthesize memberships, or redirect these dedicated owners to an unrelated site's service settings. Determine their canonical immutable workspace identities and approved tenant-bound authority first.
- Future owner-specific service-settings additions reuse existing authenticated snapshot/write RPCs and verify changed preference by a fresh server read. If the authority context is absent, remain read-only and visibly report "site context unavailable". Never present an unverified toggle or an unsupported `/services` URL as working.
- Follow `docs/admin-navigation-stability-contract.md`: preserve one site-owned sidebar and the platform service catalog; extend adapters and tests rather than redesigning the menu.
