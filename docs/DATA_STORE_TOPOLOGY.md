# EKODI data stores — deployment declaration and migration safeguards

Scope: **declaration audit only**. A binding in a Wrangler TOML file is not proof that a database exists or that a live worker uses it. The authoritative service-boundary contract remains `platform-boundaries.json` and `config/data-ownership-policy.json`. This catalog complements them without changing authority.

- Central Supabase: person/workspace authority and multiple tenant-scoped service tables. The `church_private` schema is logical isolation inside the existing Supabase project, not a separate PostgreSQL instance. Recheck RLS policies, authenticated access, and schema exposure before migrations.
- Central Cloudflare D1 (`ekodi-auth`): multiple server-owned operational namespaces. Unlike PostgreSQL it has no Supabase RLS; every query path must enforce tenant/workspace and capability scope.
- Independent board D1 (`ekodi-independent-board`): the source Wrangler manifest intentionally contains `REPLACE_WITH_INDEPENDENT_BOARD_D1_ID`. `.github/workflows/deploy-independent-board.yml` looks up or provisions the dedicated D1, injects the ID into a temporary runtime Wrangler config, applies board-owned migrations, verifies the production board, and executes a create/reply/cleanup canary. Source placeholders must **not** be reported as proof that this database is absent. Live 2026-10-09 read-only checks returned healthy DB/R2/queue bindings and 200 responses from posts/finance/notices queries. Re-check current live/provisioner evidence; this historical observation is not perpetual assurance.
- R2 bucket for board media: binary objects only, not the board's relational authority.

## Safe transition sequence

1. Inventory production resource IDs via authorized Cloudflare/Supabase control planes; reconcile declared vs actual and determine one canonical writer per dataset.
2. Measure tenant/data sensitivity, growth, connections, access failures, backup objectives and costs. Stay shared until isolation requirements justify dedicated instances. New paid projects require cost approval.
3. Back up and verify restoration in a separate environment; record counts, checksums, tenant boundaries and access behavior.
4. Deploy service-owned read/write contract, shadow reads and consistency checks. Use immutable workspace IDs rather than hostname/path as authorization.
5. Migrate via governed change, dual-read reconciliation, reversible cutover and specific regression tests for write/delete/auth/attachments.
6. Promote only through EKODI orchestration gates, independently verify production hostname and database events, and retain rollback until stability evidence exists.

`node scripts/validate-data-ownership.mjs` audits declared bindings, verifies deployment-time ID resolution where declared and fails if a configured resource still uses an unexplained placeholder. `node --test test/data-store-topology.test.mjs` exercises failure modes. `node scripts/inventory-declared-data-stores.mjs` enumerates Wrangler D1 declarations across service folders without exposing resource identifiers; unresolved source declarations are not automatically proof of a live outage. **Neither command provisions or connects to live databases**.

## Read-only live/provider checks and operations

- `node scripts/verify-live-data-stores.mjs --scope=full` performs seven bounded GET checks for public board DB bindings, read APIs, internal-host parity and rejected unauthenticated administration. It never reads or prints citizens' individual messages, does not write records and cannot verify backup restoration.
- `node scripts/verify-live-data-stores.mjs --scope=lite` uses only two public GET requests for periodic monitoring. HTTP 429 opens the circuit immediately rather than triggering a retry storm.
- `node scripts/verify-provider-data-stores.mjs` lists D1 databases by name through Cloudflare's GET-only account API using server-only `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Reports include registered names and presence booleans, never API tokens or DB UUIDs. It requires D1 Read or Write permission. Runtime ID provenance is preserved in the Cloudflare control plane, not in public CI logs.
- Dedicated `EKODI Data Store Read-Only Watch` runs hourly, does not mutate databases or GitHub issues, and has `contents: read` repository permission only. It checks quota before production D1 provider and board probes, runs only when quota is normal, and preserves sanitized artifacts. A failed workflow signals investigation, not proof of data loss. This monitor is isolated from the existing `Admin Availability Watch`, which has independent orchestration failures to repair separately.
- A success from these probes is **not** proof of physical backup restoration, tenant-wide isolation or every database in the ecosystem. Any destructive migration or new paid instance is separately governed.

## Production completion evidence required

Record task ID, owner service, actual provider resource ID (in protected internal records only), backup + restore result, access-scope tests, source/target counts, guarded deployment SHA, production functional canary, observation interval, rollback result, and timestamp. A green declaration audit alone is insufficient.
