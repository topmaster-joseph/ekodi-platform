# EKODI Marketing AI Provider Contract v1

## Purpose

This contract allows an EKODI-owned or third-party Marketing AI implementation to be connected through a replaceable adapter without coupling consumer applications to a specific provider.

The stable boundary is:

`consumer -> EKODI Marketing AI Gateway -> provider adapter -> provider`

Consumer applications never depend on provider-specific endpoints, credentials, SDKs, model names, billing objects, or error formats.

## Version

Contract version: `1.0`

Breaking changes require a new major contract version. A provider may support more than one contract version during migration.

## Provider manifest

A provider must publish configuration that validates against `config/marketing-ai-provider-manifest.schema.json`.

The registry stores at least:

- `provider_id`
- `display_name`
- `contract_version`
- provider lifecycle `status`
- supported `capabilities`
- supported `regions`
- adapter type/version
- data policy
- pricing metadata when relevant
- health-check behavior when relevant

## Stable capability contract

The initial capability vocabulary is:

| Capability | Purpose |
|---|---|
| `content.generate` | Generate or transform marketing content |
| `campaign.plan` | Build campaign plans and recommended actions |
| `audience.segment` | Analyze or segment an authorized audience dataset |
| `channel.optimize` | Recommend channel, timing, or format optimization |
| `analytics.report` | Produce explanations, summaries, and marketing performance reports |
| `publish.execute` | Execute an explicitly authorized publishing action through a reviewed channel integration |

Providers can declare a subset. `publish.execute` is an action capability and remains subject to EKODI authorization and human-action policy even when the provider supports it.

## Gateway request envelope

The Gateway owns the internal request envelope. A provider adapter receives a minimized derived payload rather than the entire internal object.

Conceptual internal request:

```json
{
  "request_id": "uuid",
  "tenant_id": "opaque-space-id",
  "actor_id": "opaque-actor-id",
  "capability": "content.generate",
  "input": {},
  "constraints": {
    "locale": "ko-KR",
    "data_region": "KR",
    "max_output_tokens": 2000
  }
}
```

`tenant_id` and `actor_id` are authorization and audit context. They must not be forwarded to an external provider unless the adapter has a documented minimum-necessary reason. Prefer provider-scoped opaque references.

## Standard adapter interface

An adapter implementation must expose equivalent operations for:

```text
capabilities()
health()
invoke(capability, minimized_request, execution_context)
normalize_error(provider_error)
```

The concrete transport can be HTTP or an internal runtime adapter. Provider-specific SDKs may exist only behind the adapter boundary.

## Standard result envelope

The adapter returns a normalized result to the Gateway:

```json
{
  "provider_id": "example-provider",
  "capability": "content.generate",
  "result": {},
  "usage": {
    "input_units": 0,
    "output_units": 0,
    "billable_units": 0
  },
  "provider_request_id": "optional-opaque-id"
}
```

Provider-specific raw metadata must not become a required consumer dependency.

## Standard errors

Adapters normalize provider errors into a stable set:

- `AUTH_FAILED`
- `RATE_LIMITED`
- `QUOTA_EXCEEDED`
- `UNSUPPORTED_CAPABILITY`
- `INVALID_REQUEST`
- `PROVIDER_UNAVAILABLE`
- `PROVIDER_TIMEOUT`
- `POLICY_BLOCKED`
- `DATA_POLICY_MISMATCH`
- `UNKNOWN_PROVIDER_ERROR`

The Gateway decides whether a normalized error is retryable and whether another provider is allowed by entitlement and routing policy.

## Entitlement before routing

Provider routing happens only after authorization and entitlement evaluation.

Required decision order:

1. authenticate actor;
2. resolve tenant/Space;
3. resolve membership/subscription;
4. verify requested capability;
5. restrict candidate providers to those allowed by entitlement and data policy;
6. route among the remaining certified providers.

A failover must never expand access. If the preferred provider fails, the fallback provider must independently satisfy the same entitlement and data-policy constraints.

## Data policy requirements

Before certification, each provider must declare:

- retention behavior;
- whether customer inputs/outputs are used for model training;
- supported processing regions;
- deletion/export capabilities when applicable;
- known subprocessors when applicable;
- sensitive-data restrictions;
- whether prompts, outputs, attachments, or metadata are persisted.

EKODI may reject or restrict a provider based on these declarations regardless of technical compatibility.

## Credential boundary

Provider credentials are stored and used only in trusted server-side infrastructure. A browser or consumer application receives neither the provider credential nor a direct privileged provider endpoint.

If a tenant supplies its own provider credential, it remains scoped to that tenant and provider and is never available to another tenant.

## Observability and usage

Each invocation should emit auditable metadata sufficient to answer:

- which tenant requested the capability;
- which entitlement allowed it;
- which provider was selected;
- which capability ran;
- when it ran and how long it took;
- whether fallback occurred;
- normalized usage and cost units when available;
- whether the action succeeded, failed, or was blocked.

Do not store full prompts or generated content in operational logs by default.

## Certification tests

A provider cannot become `certified` until it passes at least:

1. manifest/schema validation;
2. declared-capability conformance;
3. timeout and unavailable-provider behavior;
4. normalized error behavior;
5. tenant isolation;
6. unauthorized-capability rejection;
7. data-policy enforcement;
8. audit/usage emission;
9. provider suspension behavior;
10. failover behavior where configured.

## Consumer invariants

Consumer code must remain correct when:

- one provider is removed;
- the default provider changes;
- a tenant is routed to a different provider;
- a provider changes its model names or SDK;
- AI is temporarily unavailable.

EKODIBIZ and other consumers use only the EKODI Marketing AI capability contract, never the provider contract directly.
