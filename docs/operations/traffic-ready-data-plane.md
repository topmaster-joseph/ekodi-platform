# Traffic-ready data plane

This document is the operational companion to `config/data-plane-contract.json`. The JSON contract is machine-readable policy; `data-plane.js` and `data-plane-adapters.js` are the executable foundation.

## Non-negotiable invariants

1. `workspace_id` is the immutable tenant/workspace boundary. Slugs, domains, account names and provider IDs are routing attributes, never identity.
2. Cross-workspace fallback is forbidden. A missing workspace route or provider fails closed.
3. Database, file storage and cache are separate contracts. Google Drive is never treated as a relational database substitute.
4. Public delivery does not query the protected core database. Static assets, CDN/R2 and cache absorb public traffic first.
5. A provider is replaceable. Cloudflare D1, R2, KV, Google Drive and PostgreSQL-compatible systems sit behind adapters.
6. Production credentials are injected server-side. Adapters never contain provider credentials.
7. Provider migration is explicit per workspace, verified before cutover, and retains a rollback pointer.

## Account boundaries

### Physical boundary now

- `development`: existing Cloudflare Development account. Preview, staging, destructive tests and development-only data.
- `production`: existing Cloudflare Production account. Production traffic and data only.

Development must never use production data or production stateful bindings.

### Logical boundaries inside production now

- `production-core`: identity, authorization, workspace registry, billing, audit and protected APIs.
- `production-public`: public sites, static delivery, cached public metadata and high-volume assets. No core database path.

### Physical split later, without an application rewrite

When capacity, blast radius, customer isolation or billing requires it, `production-public` or a selected `isolated-workload` may move to a separate Cloudflare account or another provider. The application-facing contract must remain unchanged. The move is a provider/account routing change, not a product rewrite.

Do not create extra accounts merely to multiply free quotas. Split only for security, failure isolation, independent billing or capacity boundaries.

## Data placement

| Data class | Default | Reason |
| --- | --- | --- |
| identity, auth, billing, workspace registry | D1 core database adapter | relational state and protected control-plane data |
| workspace state and metadata | D1 workspace adapter | fast relational access, shardable by `workspace_id` |
| large workspace requiring another DB | PostgreSQL-compatible adapter | explicit per-workspace capacity migration |
| private source documents, reports, office files | Google Drive workspace adapter | document/file system of record |
| public images and downloads | R2 public adapter | high-volume public object delivery |
| menus, service catalog, read-mostly metadata | KV/cache adapter | keep repeated reads away from databases |

The database stores file metadata and provider references, not file bytes when a file store is appropriate.

## Traffic shield

The design target is not a maximum number of users. The target is that at least **95% of public/read-mostly traffic does not reach a database**.

Preferred request path:

```text
browser
  -> CDN/static asset
  -> cache/KV when dynamic metadata is required
  -> Worker/API only for real dynamic work
  -> database only for authoritative relational state
```

Interactive requests should avoid provider fan-out. Non-interactive work should be queued when possible. Provider timeouts are required at integration boundaries, and circuit breakers are recommended for remote providers.

## Workspace routing

A workspace may override the default provider only through an explicit policy entry. Example:

```js
const plane = createDataPlane({
  policy,
  registry,
  workspaceOverrides: {
    'org:high-volume-customer': {
      'workspace-record': 'postgres-workspace'
    }
  }
});
```

The override changes that workspace and data class only. There is no automatic fallback to a different workspace or provider.

## Google Drive boundary

Google Drive is a file/document provider. It must receive a server-side transport or credentialed service adapter. If the transport is absent, `createGoogleDriveFileStorageAdapter()` throws `ProviderNotConfiguredError` and the request must not silently switch to another tenant's storage.

Drive metadata needed on hot page paths should be synchronized or cached. Do not call Drive list/search/download APIs on every page render.

## Migration sequence

1. register the destination adapter and server-side credentials;
2. choose one workspace and one data class;
3. copy data without changing the read pointer;
4. verify count, integrity, access boundary and rollback location;
5. switch the explicit workspace route;
6. observe errors, latency and cost;
7. keep the old source during the retention window;
8. delete source data only through a later manual decision.

Dual-write is not the default because hidden divergence is worse than a deliberate cutover.

## Capacity triggers

Consider moving a workspace or public workload to an isolated provider/account when one or more occur:

- a tenant becomes a material share of total database or Worker load;
- its burst traffic can threaten unrelated tenants;
- contractual or regulatory isolation is required;
- independent cost attribution is required;
- database latency or queue depth approaches the service objective despite caching and query optimization.

First optimize static delivery, cache hit rate, query count and request fan-out. Account proliferation is not a substitute for architecture.

## Verification

`npm test` includes `test/data-plane.test.mjs`, which verifies:

- policy minimums and the 95% DB-bypass target;
- `workspace_id` scoping;
- public-to-core database denial;
- fail-closed provider routing;
- per-workspace provider overrides;
- cache isolation and read-through behavior;
- D1/KV/R2 adapter injection;
- Google Drive refusal when server-side transport is absent.
