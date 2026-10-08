# EKODI data stores — deployment declaration and migration safeguards

Scope: **declaration audit only**. A binding in a Wrangler TOML file is not proof that a database exists or that a live worker uses it. The authoritative service-boundary contract remains `platform-boundaries.json` and `config/data-ownership-policy.json`. This catalog complements them without changing authority.

- Central Supabase: person/workspace authority and multiple tenant-scoped service tables. The `church_private` schema is logical isolation inside the existing Supabase project, not a separate PostgreSQL instance. Recheck RLS policies, authenticated access, and schema exposure before migrations.
- Central Cloudflare D1 (`ekodi-auth`): multiple server-owned operational namespaces. Unlike PostgreSQL it has no Supabase RLS; every query path must enforce tenant/workspace and capability scope.
- Independent board D1 (`ekodi-independent-board`): Wrangler currently contains `REPLACE_WITH_INDEPENDENT_BOARD_D1_ID`. Its database and the corresponding R2 bucket require independent provider-side provisioning and live binding verification. Do not report this service as fully isolated/active from TOML alone.
- R2 bucket for board media: binary objects only, not the board's relational authority.

## Safe transition sequence

1. Inventory production resource IDs via authorized Cloudflare/Supabase control planes; reconcile declared vs actual and determine one canonical writer per dataset.
2. Measure tenant/data sensitivity, growth, connections, access failures, backup objectives and costs. Stay shared until isolation requirements justify dedicated instances. New paid projects require cost approval.
3. Back up and verify restoration in a separate environment; record counts, checksums, tenant boundaries and access behavior.
4. Deploy service-owned read/write contract, shadow reads and consistency checks. Use immutable workspace IDs rather than hostname/path as authorization.
5. Migrate via governed change, dual-read reconciliation, reversible cutover and specific regression tests for write/delete/auth/attachments.
6. Promote only through EKODI orchestration gates, independently verify production hostname and database events, and retain rollback until stability evidence exists.

`node scripts/validate-data-ownership.mjs` audits declared bindings and fails if a store is marked configured but the manifest still has a placeholder. `node --test test/data-store-topology.test.mjs` exercises failure modes. `node scripts/inventory-declared-data-stores.mjs` enumerates Wrangler D1 declarations across service folders without exposing resource identifiers; unresolved source declarations are not automatically proof of a live outage. **Neither command provisions or connects to live databases**.

## Production completion evidence required

Record task ID, owner service, actual provider resource ID (in protected internal records only), backup + restore result, access-scope tests, source/target counts, guarded deployment SHA, production functional canary, observation interval, rollback result, and timestamp. A green declaration audit alone is insufficient.
