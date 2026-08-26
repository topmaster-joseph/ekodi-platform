# EKODI Sustainable Operating Model

## Purpose

EKODI must remain useful to both ordinary users and system administrators even when an external AI provider is unavailable. AI improves the experience, but it is not the platform's life-support system.

The operating principle is:

> People use a simple experience plane. Administrators use a separate control plane. Both share a stable core. AI is replaceable enhancement, never a mandatory dependency for core service.

## Four-layer model

### 1. Foundation

Shared infrastructure that must remain stable and provider-independent:

- identity and authentication
- authorization and workspace boundaries
- data access and tenant isolation
- files and durable records
- billing state and membership state
- audit and operational logs
- monitoring, backup, and recovery

For files and durable records, **Google Workspace Shared Drive `EKODI` is the canonical system of record**. Durable business documents, final artifacts, retained AI outputs and backups must ultimately be written there through the EKODI Storage Gateway. D1 or Supabase is the operational state/index layer; Cloudflare R2 is a cache, delivery or staging layer. Neither replaces the canonical Shared Drive copy when retention is required.

External modules and browsers must never receive privileged Google credentials or write directly to the Shared Drive. The permitted path is `EKODI service/module -> api.ekodi.kr -> EKODI Storage Gateway -> Google Workspace Shared Drive EKODI`.

The detailed storage contract is `docs/EKODI-STORAGE-LAYER.md` and the machine-readable policy is `config/storage-policy.json`.

### 2. Services

Independent EKODI platforms and specialized services. Each platform keeps its own deployment boundary and private data ownership. Shared capabilities are consumed through explicit contracts rather than direct cross-platform data access.

### 3. Experience and control planes

- `ekodi.kr`: public front door
- `my.ekodi.kr`: signed-in personal home, Workspace router, account and service entry point for ordinary users
- `admin.ekodi.kr`: private control plane and operational command center for administrators

Ordinary users should not need to understand infrastructure topology. Administrators must be able to observe failures, control releases, inspect service state, and fall back to manual operation.

### 4. Intelligence

AI providers, specialist agents, external AI modules and automation sit above the stable service core.

External AI modules are replaceable capability providers. EKODI owns identity, Space, Role, Capability, tenant boundaries, persistence and audit. A module receives only the minimum capability-scoped context necessary for its task and must not receive direct EKODI database, Google Drive or privileged R2 credentials. Durable output returns to EKODI and is persisted through the Storage Gateway when retention is required.

The external module contract is `docs/EKODI-EXTERNAL-AI-MODULE-SPEC.md`, backed by `config/external-ai-module-contract.json` and `external-ai-module-gateway.js`.

The default runtime policy is:

1. use AI when available and appropriate;
2. fall back to `free_assist` when providers are missing, disabled, timed out, or unhealthy;
3. fall back to `core` if assisted fallback is also unavailable;
4. never expose provider secrets in the browser;
5. never fail a core request solely because an AI provider failed;
6. never let a provider expand its own EKODI capability;
7. never treat provider-side storage as the canonical EKODI record.

## Identity model

The canonical identity model is `Person + Space + Role + Capability`.

A person has one EKODI identity and can participate in multiple spaces such as personal, business, organization, church, community, or project spaces. Role and capability are evaluated in the active space. `My EKODI` is the user's place to see and switch that context.

The same Space/Role/Capability context scopes external AI execution and durable-record metadata.

## Shared EKODI Shell

User-facing services must adopt the shared EKODI Shell contract. New active services cannot bypass the Shell requirement. Existing legacy services may remain temporarily marked `pending`, but `pending` is migration debt, not the target state.

The Shell must preserve:

- consistent identity context
- Workspace switching
- safe navigation back to My EKODI
- service identity and capability context
- mobile usability
- service isolation and security boundaries

## Administrator model

`admin.ekodi.kr` is not a general-user dashboard. It is a control plane for:

- ecosystem health
- service and domain state
- deployment observation and guarded release
- authentication and access controls
- storage and durable-record health
- AI module registration, operations and resilience state
- audit history
- manual fallback and recovery

High-impact or destructive actions must remain human-gated according to mission governance and security policy.

## Release discipline

Production release is not complete when code merely compiles or deploys. Applicable releases must pass:

1. syntax and source validation;
2. automated tests;
3. platform-boundary validation;
4. mission-governance validation;
5. AI provider-independence validation;
6. storage and external-AI contract validation;
7. `AI_PROVIDER=NONE` survival test;
8. staging verification;
9. guarded production promotion;
10. real public-host verification;
11. monitoring or audit visibility after release.

For storage-affecting work, completion additionally requires proof that required durable output reaches the EKODI Shared Drive. For external AI work, completion requires proof that the module can be removed or replaced without losing canonical EKODI data.

Direct production deployment paths are intentionally blocked where guarded workflows are required.

## Cost and sustainability

Core service should prefer deterministic logic, stored data, templates, caching, and ordinary application code before calling a paid AI provider. AI calls should be reserved for tasks that materially benefit from model reasoning or generation.

Repeated outputs should be cached or persisted where appropriate instead of regenerated without need. Provider selection should remain replaceable so EKODI can adapt to price, quality, policy, or availability changes without redesigning the ecosystem.

Operational databases should keep only the state and indexes needed for fast service. Large or durable retained artifacts should not be duplicated indefinitely across paid providers when the Shared Drive canonical copy is sufficient.

## Current migration rule

The architecture is considered established when the contracts above are enforced by automated regression tests. Individual legacy services may still require Shell migration, Storage Gateway adoption or product-specific cleanup. Such migration work must be completed through staging and guarded release rather than by changing status labels without verification.
