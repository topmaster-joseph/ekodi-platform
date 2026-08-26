# EKODI External AI Module Specification v1.0

## Purpose

An external vendor may build a specialist AI independently and connect it to EKODI as a replaceable module. EKODI owns identity, Space/tenant context, authorization, storage, audit and user experience. The external vendor owns only the specialist inference/service engine behind this contract.

## Boundary

```text
EKODI user
   |
   v
EKODI service authenticates user + Space + Role + Capability
   |
   v
registered EKODI internal caller
   |
   v
api.ekodi.kr/api/ai-modules/v1/execute
   |
   v
EKODI AI Module Gateway
   |
   +----> vendor A /v1/execute
   +----> vendor B /v1/execute
   +----> future provider
   |
   v
optional EKODI Storage Gateway
   |
   v
drive.ekodi.kr
   |
   v
Google Workspace Shared Drive EKODI
```

The vendor is never an EKODI identity provider, database administrator, Drive administrator or storage credential holder.

## EKODI caller trust

`/execute` is not a browser endpoint. A request is accepted only when both are present:

- valid `x-ekodi-ai-gateway-key` server secret;
- `x-ekodi-caller-id` registered in `EKODI_AI_MODULE_CALLERS`.

The registered internal caller is responsible for authenticating the end user or agent and resolving the active Space, Role and Capability before invoking the gateway. The gateway adds `attestedBy: ekodi:<caller-id>` before sending context to the external module.

A browser or vendor cannot self-register as an internal caller.

## Vendor manifest

EKODI registers each vendor server-side:

```json
{
  "id": "vendor.marketing-ai",
  "name": "Vendor Marketing AI",
  "version": "1.0.0",
  "endpoint": "https://vendor.example.com",
  "capabilities": ["marketing.campaign", "marketing.content", "marketing.analysis"],
  "secretBinding": "VENDOR_MARKETING_AI_SECRET",
  "timeoutMs": 12000,
  "enabled": true
}
```

`secretBinding` names a Cloudflare Worker secret. The actual secret is never stored in the manifest, committed to GitHub or returned by the API.

## Vendor endpoints

Every module implements HTTPS endpoints:

- `GET /v1/health`
- `POST /v1/execute`

## Execution request sent to vendor

```json
{
  "contractVersion": "1.0.0",
  "requestId": "uuid",
  "moduleId": "vendor.marketing-ai",
  "capability": "marketing.campaign",
  "context": {
    "spaceId": "jadam",
    "serviceId": "marketing",
    "actorId": "ekodi-user-or-agent-id",
    "role": "owner",
    "capabilities": ["marketing.campaign"],
    "attestedBy": "ekodi:marketing-service"
  },
  "input": {
    "storeId": "mokpo-univ",
    "goal": "increase repeat visits"
  }
}
```

Only the minimum task context is sent. Google tokens, Drive credentials, D1/Supabase credentials, R2 credentials and unrelated tenant data are prohibited.

## Execution response

Success:

```json
{
  "contractVersion": "1.0.0",
  "requestId": "same-uuid",
  "ok": true,
  "output": { "campaign": "..." },
  "usage": { "units": 1 },
  "meta": { "model": "vendor-model-name" }
}
```

Failure:

```json
{
  "contractVersion": "1.0.0",
  "requestId": "same-uuid",
  "ok": false,
  "error": {
    "code": "TEMPORARY_UNAVAILABLE",
    "message": "service unavailable"
  }
}
```

The gateway rejects the wrong contract version, wrong request ID, invalid JSON envelope, disabled modules, unsupported capabilities and provider errors.

## EKODI gateway API

Base path: `/api/ai-modules/v1`

- `GET /health` — public non-secret readiness counts only.
- `GET /modules` — privileged registry view without endpoints or secrets.
- `POST /execute` — privileged registered-EKODI-caller execution.

## Capability enforcement

Before execution:

1. the EKODI service authenticates the actor and resolves the active context;
2. the service calling the gateway must be a registered internal caller;
3. the context must contain the requested capability or `ai:*`;
4. the selected module manifest must also declare that capability.

The vendor cannot add capabilities to itself and cannot use one tenant context to request another tenant's data.

## Persistence

A registered EKODI caller may request persistence:

```json
{
  "moduleId": "vendor.marketing-ai",
  "capability": "marketing.campaign",
  "context": {
    "spaceId": "jadam",
    "serviceId": "marketing",
    "actorId": "123",
    "role": "owner",
    "capabilities": ["marketing.campaign"]
  },
  "input": { "goal": "repeat visits" },
  "persist": {
    "storageRoute": "biz",
    "recordType": "marketing_campaign",
    "retentionClass": "business_record",
    "title": "campaign-2026-08.json"
  }
}
```

The vendor never writes the file. The result returns to EKODI, the API calls the EKODI Storage Gateway, `drive.ekodi.kr` uses the existing encrypted primary OAuth connection and `storage_routes`, and the durable copy is written to Shared Drive `EKODI`.

## Replacement rule

User-facing services depend on capabilities, not vendor identity. A service requests `marketing.campaign`; the configured vendor can change without redesigning the EKODI service or moving canonical EKODI data.

## Failure rule

External AI is an enhancement layer. Provider failure must not disable the EKODI core service. Product code retains deterministic or `free_assist` fallback according to the EKODI AI resilience policy.

## Vendor acceptance checklist

A module is accepted only when:

- it implements the v1 health and execute contract over HTTPS;
- it never requests direct EKODI Drive/DB/R2 credentials;
- it accepts only capability-scoped EKODI context;
- it echoes `contractVersion` and `requestId` exactly;
- it returns structured errors;
- it passes timeout and unavailable-provider tests;
- durable results are persisted by EKODI, never the vendor;
- it can be removed or replaced without data migration from the vendor into EKODI.
