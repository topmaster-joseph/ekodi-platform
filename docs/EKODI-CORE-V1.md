# EKODI Core v1

## Decision

EKODI adopts a Core-first hybrid cloud architecture.

EKODI Core is not a new monolithic server and it is not a forced migration into one database. It is the stable product boundary that owns identity and organization contracts, authorization rules, auditability, shared service contracts, provider independence and operational completion gates.

Cloudflare, Supabase, external AI providers, object storage and future worker servers are replaceable infrastructure behind explicit EKODI contracts.

## Existing foundation

The existing control plane remains the starting point:

- `api.ekodi.kr` / `control-api`: shared control and data API layer
- `admin.ekodi.kr`: private control plane UI
- `auth.ekodi.kr`: shared authentication entry
- `ekodi-auth` D1: current shared control-plane database
- `customer_tenants`: canonical organization record for Core v1
- `customer_users`: canonical person record for the customer control plane
- `customer_memberships`: canonical person-to-organization membership and role relation
- `customer_audit_logs`: canonical customer control-plane audit trail

The names above may be migrated later behind compatibility contracts. Core v1 does not rename live tables only for aesthetic consistency.

## Architecture

```text
EKODI sites and apps
        |
        v
  EKODI service contracts
        |
        v
 api.ekodi.kr / EKODI Core
        |
        +---- D1 control-plane namespaces
        +---- Supabase/Postgres platform-owned namespaces
        +---- object storage for files, exports and backups
        +---- replaceable AI adapters
        +---- optional queue/worker/container compute
```

## Core rules

1. A platform owns its private data. Cross-platform private data access requires an explicit shared API contract and server-side authorization.
2. Core business workflows must remain usable when external AI providers are unavailable.
3. Browser clients must not require provider secrets and must not treat an external AI provider as a system of record.
4. Healthy platform data is not moved into one database merely to make the architecture look uniform.
5. Shared database migrations are shared-core changes and require impact review.
6. New provider integrations must be replaceable adapters where practical.
7. Backups are not considered complete until a restore path is verified.
8. A change is not complete merely because it is committed or deployed. Production hostnames, tenant boundaries, observability and fallback behavior must pass verification.

## Migration path

### Phase A: Contract first

- Adopt `config/ekodi-core-contract.json` as the machine-readable Core contract.
- Validate it against `platform-boundaries.json`.
- Keep the existing tenant/user/membership schema as the Core v1 compatibility model.
- Prevent new services from bypassing declared platform boundaries.

### Phase B: Shared API normalization

- Introduce stable versioned Core service contracts under `api.ekodi.kr` as runtime changes are needed.
- Route organization, membership, authorization, audit, shared files and provider adapters through those contracts.
- Migrate direct cross-platform reads into explicit APIs incrementally.

### Phase C: Resilience and portability

- Verify independent exports for D1 and each Supabase/Postgres platform namespace.
- Store backup artifacts separately from the primary store.
- Perform a restore drill and record the recovery procedure.
- Confirm essential non-AI workflows operate with all AI providers disabled.

### Phase D: Production cutover gates

EKODI Core v1 is fully complete only when every completion gate in `config/ekodi-core-contract.json` passes, including real production hostname regression tests, tenant isolation verification, admin observability, AI-outage graceful degradation and verified backup/restore.

## Non-goals

- No big-bang rewrite.
- No forced migration of every service to Supabase/Postgres.
- No forced migration of every service to D1.
- No new always-on VPS unless workload economics or runtime requirements justify it.
- No direct production deployment solely to satisfy an architecture document.

## Change policy

New functionality should prefer Core contracts first. Existing services migrate incrementally when touched or when a boundary risk is identified. Revenue-critical sites must continue to operate throughout the migration.
