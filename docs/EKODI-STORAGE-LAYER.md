# EKODI Storage Layer v1.0

## Canonical rule

Google Workspace Shared Drive **EKODI** is the canonical system of record for durable EKODI files and final artifacts.

This is not the same as putting every runtime value in Drive. EKODI uses three storage tiers:

1. **Canonical** — Google Workspace Shared Drive `EKODI`: durable records, final documents, retained AI outputs, business evidence, backups.
2. **Operational** — D1 or Supabase: identity/workspace state, roles, capabilities, job state, counters, indexes and fast operational queries.
3. **Delivery** — Cloudflare R2: cache, public delivery copies, temporary generated assets and large-object staging.

D1/Supabase and R2 are not authoritative replacements for a durable record that must be retained in the EKODI Shared Drive.

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
Google Drive API
          |
          v
Google Workspace Shared Drive: EKODI
```

External modules must never receive Google Workspace credentials and must never write directly to the Shared Drive.

## API

Base path: `/api/storage/v1`

- `GET /health` — non-secret configuration status.
- `GET /policy` — authenticated storage policy summary.
- `POST /records` — authenticated durable record creation in the Shared Drive.

`POST /records` requires `x-ekodi-storage-key` and a JSON body containing:

```json
{
  "spaceId": "jadam",
  "serviceId": "marketing",
  "recordType": "marketing_report",
  "createdBy": "user-or-agent-id",
  "retentionClass": "business_record",
  "title": "2026-08-marketing-report.json",
  "mimeType": "application/json",
  "contentText": "{\"summary\":\"...\"}",
  "sourceModuleId": "vendor.marketing-ai"
}
```

Allowed retention classes are `temporary`, `operational`, `business_record`, and `permanent`.

Inline payloads are intentionally bounded. Large assets should use an EKODI-approved staging flow and still end with the authoritative retained copy in Shared Drive when retention is required.

## Google authentication

Production should use a dedicated Google service account that has only the minimum Drive access required for the EKODI Shared Drive or designated folders.

Worker secrets:

- `EKODI_STORAGE_GATEWAY_KEY`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

Optional configuration:

- `EKODI_DRIVE_RECORDS_FOLDER_ID`
- `EKODI_DRIVE_ALLOWED_FOLDER_IDS`
- `GOOGLE_DRIVE_ACCESS_TOKEN` for short-lived testing only; not the preferred production mechanism.

Known protected roots currently include:

- `01_CORE` — `1q-6OpN9zN2mD6EBaX-KJ5MoBEYdIZcwo`
- `99_BACKUP` — `19sHUDWjPL-a66prnpCJN4H24hUqEJpiL`

## Tenant and audit rules

Every durable write carries `spaceId`, `serviceId`, `recordType`, `createdBy`, `retentionClass`, and optional `sourceModuleId` as EKODI metadata. The gateway writes an operational audit index to D1 when D1 is available.

The audit index is not the durable file itself. The Drive file remains the authoritative retained artifact.

## Security invariants

The following paths are forbidden:

```text
external AI -> Google Drive direct
browser -> privileged Google credentials
external AI -> D1/Supabase direct
external AI -> privileged R2 credentials
```

The permitted pattern is contract-based access through `api.ekodi.kr`.

## Definition of done

A storage integration is not complete until:

1. it uses the Storage Gateway;
2. it preserves Space/Service metadata;
3. required durable output is present in Shared Drive;
4. the operational audit is recorded;
5. no provider credential is exposed to a browser or external module;
6. failure of Drive storage is visible and never silently reported as persisted.
