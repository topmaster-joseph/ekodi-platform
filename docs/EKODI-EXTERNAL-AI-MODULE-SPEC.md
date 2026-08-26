# EKODI External AI Module Specification v1.0

## Purpose

An external vendor may build a specialist AI independently and connect it to EKODI as a replaceable module. EKODI owns identity, tenant context, authorization, storage, audit and user experience. The external vendor owns only the specialist inference/service engine behind the agreed contract.

## Boundary

```text
EKODI user/service
      |
      v
EKODI identity + Space + Role + Capability
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
Google Workspace Shared Drive EKODI
```

The vendor is never an EKODI identity provider, database administrator or Drive administrator.

## Vendor manifest

EKODI registers each vendor server-side with a manifest shaped like:

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

`secretBinding` names a Cloudflare Worker secret. The actual secret is never committed to GitHub or returned by the API.

## Vendor endpoints

Every module implements:

- `GET /v1/health`
- `POST /v1/execute`

HTTPS is mandatory.

## Execution request

EKODI sends:

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
    "capabilities": ["marketing.campaign"]
  },
  "input": {
    "storeId": "mokpo-univ",
    "goal": "increase repeat visits"
  }
}
```

The context contains only the minimum EKODI information needed for the task. Google tokens, database credentials, R2 credentials and unrelated tenant data are prohibited.

## Execution response

Success:

```json
{
  "contractVersion": "1.0.0",
  "requestId": "same-uuid",
  "ok": true,
  "output": {
    "campaign": "..."
  },
  "usage": {
    "units": 1
  },
  "meta": {
    "model": "vendor-model-name"
  }
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

The gateway rejects responses with the wrong contract version, request ID or envelope shape.

## EKODI gateway API

Base path: `/api/ai-modules/v1`

- `GET /health` — contract and registered-module summary without secrets.
- `GET /modules` — authenticated module registry view without endpoints or secrets.
- `POST /execute` — authenticated server-to-server execution.

The gateway requires `x-ekodi-ai-gateway-key`. Normal browser clients should call an EKODI service backend, not this privileged integration endpoint directly.

## Capability enforcement

Both conditions must be true before execution:

1. the registered module manifest declares the requested capability;
2. the active EKODI context grants the actor that capability or `ai:*`.

This prevents a vendor module from expanding its own authority.

## Persistence

A caller may ask EKODI to persist a successful output:

```json
{
  "moduleId": "vendor.marketing-ai",
  "capability": "marketing.campaign",
  "context": { "spaceId": "jadam", "serviceId": "marketing", "actorId": "123", "role": "owner", "capabilities": ["marketing.campaign"] },
  "input": { "goal": "repeat visits" },
  "persist": {
    "recordType": "marketing_campaign",
    "retentionClass": "business_record",
    "title": "campaign-2026-08.json"
  }
}
```

The external vendor still does not receive Drive access. The result comes back to EKODI and the Storage Gateway writes the durable copy to the EKODI Shared Drive.

## Replacement rule

User-facing EKODI services must depend on a capability, not a vendor identity. A service asks for `marketing.campaign`; the configured module may change from vendor A to vendor B without redesigning the service or moving the canonical data.

## Failure rule

External AI is an enhancement layer. A provider outage must not disable the EKODI core service. Product code must retain its deterministic or `free_assist` fallback according to EKODI AI resilience policy.

## Vendor acceptance checklist

A vendor module is accepted only when:

- it implements the v1 health and execute contract;
- it uses HTTPS;
- it does not require direct EKODI Drive/DB/R2 credentials;
- it accepts tenant context but cannot change its own capabilities;
- it echoes `contractVersion` and `requestId` correctly;
- it returns structured error envelopes;
- it passes timeout and unavailable-provider tests;
- any durable result is persisted by EKODI, not by the vendor;
- it can be removed without data migration from the vendor into EKODI.
