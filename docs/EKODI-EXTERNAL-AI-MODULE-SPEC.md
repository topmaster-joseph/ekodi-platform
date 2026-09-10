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
EKODI Storage Gateway
   |
   v
EKODI managed canonical store

(Current EKODI implementation details remain behind the Storage Gateway and are not part of the vendor contract.)
```

The vendor is never an EKODI identity provider, database administrator, canonical-storage administrator or EKODI credential holder.

## EKODI caller trust

`/execute` is not a browser endpoint. EKODI accepts execution only from registered server-side callers authenticated by an internal gateway credential. Internal caller headers, registry names and secret-binding names are implementation details and are not part of the vendor contract.

The registered internal caller authenticates the end user or agent and resolves the active Space, Role and Capability before invoking the gateway. The gateway sends only the resulting attestation, such as `attestedBy: ekodi:<caller-id>`, to the external module. A browser or vendor cannot self-register as an internal caller.

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
    "spaceId": "ref_7d91c42a1e7c",
    "serviceId": "marketing",
    "actorId": "ref_6e4b8e2f19ad",
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

Only the minimum task context is sent. EKODI credentials, canonical storage/database credentials, canonical actor/Space identifiers, source topology and unrelated tenant data are prohibited.

The gateway pseudonymizes canonical identifiers and attaches a short-lived task grant:

```json
{
  "capabilityGrant": {
    "grantId": "same-request-id:1",
    "audience": "vendor.marketing-ai",
    "capability": "marketing.campaign",
    "issuedAt": "ISO-8601",
    "expiresAt": "ISO-8601 within 60 seconds",
    "singleUseIntent": true,
    "ekodiApiToken": false,
    "attestedBy": "ekodi:marketing-service"
  },
  "dataPolicy": {
    "retention": "transient",
    "trainingAllowed": false,
    "secondaryUseAllowed": false,
    "canonicalStorageOwnedByEkodi": true
  }
}
```

The capability grant is a vendor execution attestation only. It is never an EKODI API token and cannot be used by the provider to query EKODI systems.

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

The gateway rejects the wrong contract version, wrong request ID, invalid JSON envelope, disabled modules, unsupported capabilities, oversized responses and provider errors.

## Idempotency, retry and circuit breaking

Every vendor execution carries `x-ekodi-idempotency-key`, equal to the EKODI request ID. Retry is disabled by default. A module is retried only when its server-side manifest opts in with `retrySafe: true`, and never more than two attempts. The same idempotency key is reused across those attempts.

Only transient failures are retryable. Timeouts, HTTP 429, 502, 503 and 504 may be retried. Other 4xx responses and contract violations are not retried.

The gateway maintains a best-effort circuit breaker per module inside the Worker isolate. Repeated provider failures temporarily open the circuit so external failure cannot cascade into EKODI core services.

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

The vendor never writes the durable record and never receives canonical storage credentials or topology. The result returns to EKODI and is persisted only through the EKODI Storage Gateway into the EKODI managed canonical store. The concrete storage implementation may change without changing the vendor contract.

## Audit contract

Every execution is auditable by request ID. EKODI records module, capability, Space/service scope, actor and caller, provider model when returned, latency, storage status, guardrail policy version, final status and error code when applicable. Provider secrets and raw projected payloads are not written to the audit row.

## Provider data-use rule

Data supplied to an external AI is task-bound and transient. Model training, unrelated secondary use and unnecessary long-term retention are prohibited. A vendor requiring broader data rights does not conform to this contract.

## Versioning rule

The endpoint and envelope remain contract v1.0.0. Compatible guardrail additions are additive within v1. A breaking envelope, trust or execution change requires a v2 contract and migration window.

## Replacement rule

User-facing services depend on capabilities, not vendor identity. A service requests `marketing.campaign`; the configured vendor can change without redesigning the EKODI service or moving canonical EKODI data.

## Failure rule

External AI is an enhancement layer. Provider failure must not disable the EKODI core service. Product code retains deterministic or `free_assist` fallback according to the EKODI AI resilience policy.

## Vendor acceptance checklist

A module is accepted only when:

- it implements the v1 health and execute contract over HTTPS;
- it never requests direct EKODI storage/database credentials or topology;
- it accepts only capability-scoped EKODI context and treats the capability grant as execution attestation, not an EKODI API token;
- it echoes `contractVersion` and `requestId` exactly;
- it does not train on, repurpose or unnecessarily retain EKODI task data;
- it returns structured errors and respects the response-size limit;
- it passes timeout and unavailable-provider tests;
- if `retrySafe` is enabled, it safely deduplicates repeated `x-ekodi-idempotency-key` values;
- durable results are persisted by EKODI, never the vendor;
- it can be removed or replaced without data migration from the vendor into EKODI.
