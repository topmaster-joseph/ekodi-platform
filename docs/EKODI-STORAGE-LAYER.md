# EKODI Storage Layer v1.0

## Canonical rule

Google Workspace Shared Drive **EKODI** is the canonical system of record for durable EKODI files and final artifacts.

EKODI uses three storage tiers:

1. **Canonical** — Google Workspace Shared Drive `EKODI`: durable records, final documents, retained AI outputs, business evidence and backups.
2. **Operational** — D1 or Supabase: identity/workspace state, roles, capabilities, job state, counters, indexes and fast operational queries.
3. **Delivery** — Cloudflare R2: cache, public delivery copies, temporary generated assets and large-object staging.

D1/Supabase and R2 are not authoritative replacements for a durable record that must be retained in the EKODI Shared Drive.

## Existing canonical control plane

The existing `drive.ekodi.kr` Storage Worker remains the only Google-storage control plane.

- Primary Google account is restricted to the `ekodi.kr` organization.
- The canonical Shared Drive ID and name are configured in `wrangler.storage.toml`.
- OAuth refresh tokens are AES-GCM encrypted in `storage_connections`.
- Service-to-folder routing is stored in `storage_routes`.
- Canonical folders are `01_CORE`, `02_CHURCH`, `03_BIZ`, `04_BOOKS`, `05_COMMUNITY`, `06_WORK`, `07_EDUCATION`, `08_MEDIA`, `09_CAMP`, and `99_BACKUP`.
- Cloudflare R2 remains a delivery/staging layer through the same Storage control plane.

The Storage Gateway does not introduce a second Google credential system.

## Required write path

```text
EKODI service / external AI module
          |
          v
api.ekodi.kr
          |
          v
EKODI Storage Gateway
          |
          v
drive.ekodi.kr
          |
          v
encrypted primary OAuth connection + storage_routes
          |
          v
Google Workspace Shared Drive: EKODI
```

Google OAuth credentials stay inside the `drive.ekodi.kr` Worker. External modules and ordinary browser clients never receive them.

## API

Canonical facade: `https://api.ekodi.kr/api/storage/v1`

Storage-control implementation: `https://drive.ekodi.kr/api/storage/v1`

- `GET /health` — non-secret canonical Drive and route readiness.
- `GET /policy` — authenticated storage policy summary.
- `POST /records` — authenticated durable record creation.

`POST /records` requires the server-to-server `x-ekodi-storage-key` and a JSON body such as:

```json
{
  "spaceId": "jadam",
  "serviceId": "marketing",
  "storageRoute": "biz",
  "recordType": "marketing_report",
  "createdBy": "user-or-agent-id",
  "retentionClass": "business_record",
  "title": "2026-08-marketing-report.json",
  "mimeType": "application/json",
  "contentText": "{\"summary\":\"...\"}",
  "sourceModuleId": "vendor.marketing-ai"
}
```

For canonical EKODI services, common service IDs map to storage routes. A caller may provide an explicit `storageRoute` when a specialist service belongs under another canonical area, such as Marketing under `biz`.

Allowed retention classes are `temporary`, `operational`, `business_record`, and `permanent`.

Inline payloads are bounded to 8 MiB. Large assets should use an approved staging flow and still end with the authoritative retained copy in Shared Drive when retention is required.

## Authentication and secrets

Google secrets are configured only on the Storage Worker and continue to use the existing OAuth system:

- `GOOGLE_DRIVE_CLIENT_SECRET`
- `STORAGE_CREDENTIAL_KEY`
- encrypted refresh token in `storage_connections`

`api.ekodi.kr` does **not** need Google Drive credentials. It needs only the service-to-service `EKODI_STORAGE_GATEWAY_KEY` when server-side durable writes are enabled. The same gateway key is configured on the Storage Worker to validate those calls.

Secrets are never committed to GitHub.

## Tenant and audit rules

Every durable write carries `spaceId`, `serviceId`, `recordType`, `createdBy`, `retentionClass`, optional `storageRoute`, and optional `sourceModuleId` as EKODI metadata. Successful and failed writes are indexed in `storage_audit_logs`.

The audit index is not the durable file itself. The Shared Drive file remains the authoritative retained artifact.

## Security invariants

Forbidden paths:

```text
external AI -> Google Drive direct
browser -> privileged Google credentials
external AI -> D1/Supabase direct
external AI -> privileged R2 credentials
second/parallel Google credential system -> canonical Drive
```

The permitted durable write pattern is contract-based access through `api.ekodi.kr`, with Google access terminating inside `drive.ekodi.kr`.

## Definition of done

A storage integration is not complete until:

1. it uses the Storage Gateway;
2. it preserves Space/Service metadata and a canonical storage route;
3. required durable output is present in Shared Drive;
4. the operational audit is recorded;
5. no provider or browser receives privileged Google credentials;
6. a failed Drive write is never reported as persisted;
7. no parallel Google credential system is introduced.
