# EKODI Marketing AI

## Decision

The canonical product name is **EKODI Marketing AI (에코디 마케팅AI)**.

The former wording **EKODIBIZ Marketing AI (에코디비즈 마케팅AI)** is deprecated and must not be used in new UI, documentation, configuration, contracts, or service copy.

EKODI Marketing AI is a provider-neutral, shared capability of the EKODI ecosystem. It is not owned by or embedded inside EKODIBIZ. EKODIBIZ is one consumer of EKODI Marketing AI through the same public capability contract available to other eligible EKODI customers.

## Architectural boundary

```text
Individual / Institution / Organization / EKODIBIZ
                    |
             Identity + Space
                    |
            Entitlement Engine
                    |
       EKODI Marketing AI Gateway
                    |
             Provider Registry
          /          |          \
 EKODI provider  Partner A  Partner B
      adapter      adapter    adapter
```

The gateway owns provider selection. Consumer applications must not call a marketing AI provider directly.

## Customer and tenant model

The supported customer scopes are:

- `individual`
- `institution`
- `organization`

EKODIBIZ is a product/channel consuming the capability, not a tenant type.

Every protected request is evaluated using the existing EKODI identity model (`Person + Space + Role + Capability`) and a resolved subscription/plan. Every request, job, usage record, and audit event must carry an immutable `tenant_id` or equivalent EKODI Space identifier.

## Entitlement model

Marketing AI access is configuration-driven rather than hard-coded into applications.

The conceptual relationship is:

`membership plan -> entitlement -> capability/provider policy/quota`

An entitlement can constrain:

- allowed marketing capabilities;
- allowed or preferred providers;
- monthly/daily quota;
- rate limit;
- premium features;
- effective start/end dates;
- privacy, region, or data-handling constraints.

Recommended provider selectors are:

- `any_certified`
- `ekodi-default`
- `provider:<provider_id>`
- an ordered list of preferred certified providers.

Changing a member grade or plan must be able to change access without redeploying EKODIBIZ or another consumer application.

## Capability vocabulary

Provider-specific model names must not leak into the core domain contract. Consumers request stable capabilities such as:

- `content.generate`
- `campaign.plan`
- `audience.segment`
- `channel.optimize`
- `analytics.report`
- `publish.execute`

Providers may support all or only part of the vocabulary. Capability negotiation happens through the Provider Registry.

## Provider Registry

Each internal or third-party marketing AI is registered using the versioned provider manifest contract in `config/marketing-ai-provider-manifest.schema.json`.

Provider lifecycle states are:

- `draft`
- `testing`
- `certified`
- `suspended`
- `retired`

Only a `certified` provider may be selected for general production traffic unless an explicitly isolated testing policy allows otherwise.

## Runtime flow

1. Authenticate the person or service principal.
2. Resolve EKODI Space/tenant, role, membership plan, and subscription state.
3. Evaluate the requested capability against entitlement policy.
4. Select an allowed certified provider using routing policy, availability, privacy constraints, region, cost, and preference.
5. Build a provider-minimized request and invoke the provider through its adapter.
6. Record usage and an auditable decision record.
7. If the provider fails, retry or fail over only to another provider allowed by the same entitlement and data policy.
8. If no compliant provider is available, degrade safely rather than bypassing the entitlement boundary.

## Provider isolation and security

A third-party provider is an external capability supplier, never a trusted extension of the EKODI core.

- Provider credentials remain server-side and are never exposed to a browser.
- Providers do not read the EKODI core database directly.
- Adapters receive the minimum data required for the requested capability.
- Internal person IDs and customer secrets should be replaced with opaque scoped identifiers where possible.
- Cross-tenant access is forbidden.
- Data retention, model-training use, deletion, export, region, and subprocessors must be declared before certification.
- Provider-specific failure must not break identity, billing, membership, or non-AI core workflows.

## EKODIBIZ rule

EKODIBIZ may display, package, sell, or otherwise provide EKODI Marketing AI to its customers, but it consumes the capability through the same gateway contract. It must not own a private fork of the provider selection, entitlement, or provider credential logic.

Preferred wording:

- `에코디 마케팅AI`
- `에코디 마케팅AI 사용`
- `에코디 마케팅AI 제공`

Deprecated wording:

- `에코디비즈 마케팅AI`
- wording that implies Marketing AI is technically owned by EKODIBIZ.

## Subservice naming

User-facing subservices should inherit the parent name rather than create EKODIBIZ-specific AI brands unless a separate product has an explicit reason to do so.

Examples:

- 에코디 마케팅AI 콘텐츠
- 에코디 마케팅AI 캠페인
- 에코디 마케팅AI 고객분석
- 에코디 마케팅AI 채널최적화
- 에코디 마케팅AI 성과분석
- 에코디 마케팅AI 퍼블리싱

Internal slugs such as `marketing-ai` may remain stable to avoid unnecessary breaking changes.

## Data model direction

The runtime implementation should keep these responsibilities separate even if the first release stores them in the same database:

- `marketing_ai_providers`
- `marketing_ai_capabilities`
- `marketing_ai_provider_capabilities`
- `plans`
- `plan_entitlements`
- `tenant_subscriptions`
- `marketing_ai_usage_ledger`
- `marketing_ai_routing_policies`

Provider health and billing events may be added as independent operational records.

## External provider onboarding

A third-party development company can connect a compatible marketing AI without changing EKODIBIZ code when it supplies:

1. a valid provider manifest;
2. a versioned adapter implementing the EKODI Marketing AI provider contract;
3. declared data and privacy policy;
4. health/availability behavior;
5. capability and quota metadata;
6. successful certification tests for tenant isolation, authorization, timeout, failure, and audit behavior.

A provider can then be offered selectively to individuals, institutions, or organizations by membership plan, customer contract, or operator policy.

## Acceptance criteria

The architecture is considered correctly implemented when all of the following are true:

1. EKODIBIZ contains no provider-specific integration required for Marketing AI use.
2. A new certified provider can be added without changing EKODIBIZ application code.
3. A provider can be suspended without disabling the EKODI core.
4. A member's plan can change Marketing AI access without application deployment.
5. A tenant can never receive another tenant's data, context, credential, usage, or result.
6. Provider selection is auditable.
7. External providers receive only the minimum authorized payload.
8. Provider-specific names are absent from the stable consumer capability contract.
9. All user-facing product copy uses `에코디 마케팅AI` as the canonical parent name.

## Migration sequence

1. Canonicalize product naming and documentation.
2. Introduce Provider Registry and versioned adapter contract.
3. Introduce Entitlement Engine and usage ledger.
4. Route all EKODIBIZ Marketing AI use through the gateway.
5. Add provider certification tests and an onboarding workflow.
6. Add administrator controls for provider status, routing, entitlement, quota, and audit.
7. Migrate other EKODI customer-facing services to the same contract where useful.
