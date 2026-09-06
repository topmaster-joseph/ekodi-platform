# EKODI Platform v4.3 architecture

## Scope

Version 4.3 is an ecosystem operating architecture with two distinct human-facing planes over a shared stable core:

1. `ekodi.kr` is the public front door.
2. `my.ekodi.kr` is the signed-in experience plane for ordinary users.
3. `admin.ekodi.kr` is the private control plane for system administrators.
4. Specialized EKODI services remain isolated deployment and data domains.
5. AI and automation enhance services but are replaceable and must never be required for core operation.

The architecture preserves the product rule that ordinary users should not need to understand system topology while administrators must retain observability, manual control, guarded deployment, and recovery paths.

## Layers

### Foundation

Shared provider-independent capabilities include authentication, authorization, Workspace context, durable records, files, membership/billing state, audit, monitoring, backup, and recovery.

Shared infrastructure must remain narrow. Platform-specific private data stays with the platform or tenant that owns it and is not read directly by another platform.

### Services

EKODI services are independent platforms or specialized services. Ownership, deployment, host, and data boundaries are governed by `platform-boundaries.json`.

Normal source changes deploy only the owning platform. Shared edge runtimes require cross-domain regression checks.

### Experience plane

`my.ekodi.kr` is the signed-in home for ordinary users. It owns the personal entry experience, Workspace selection, identity/account management, and safe navigation into services.

The canonical identity model is `Person + Space + Role + Capability`. A person can participate in multiple spaces without maintaining a separate identity for each service.

Public workspace routing follows the Constitution: the canonical address is `ekodi.kr/{slug}`, while workspace kind remains internal metadata bound to immutable `workspace_id`. The `ekodi-space` Worker remains an internal Service Binding engine behind the apex workspace gateway. `space.ekodi.kr` is a legacy compatibility alias only and must redirect workspace paths to the apex; it is not a separate user-facing service.

### Control plane

`admin.ekodi.kr` is a private operational command center, not a general-user dashboard. It exists for service health, domains, access, deployment observation, AI operations, audit, recovery, and manual fallback.

Privileged, destructive, legally sensitive, financially sensitive, rights-reducing, or mission-sensitive actions remain subject to human gates and mission governance.

### Intelligence layer

AI providers and specialist agents sit above the stable core. `ai-resilience-runtime.js` implements timeout, circuit-breaker, provider failover, `free_assist`, and final `core` fallback behavior.

`config/ai-provider-independence.json` requires all EKODI surfaces to survive `AI_PROVIDER=NONE`. A provider failure must degrade assistance rather than fail the core request.

## Shared EKODI Shell

User-facing services adopt the shared Shell contract for identity context, Workspace context, navigation, mobile consistency, and service identity.

`ekodi-service-manifest.js` is the canonical service manifest and declares `shellPolicy: required-for-user-facing-services`.

New active services cannot bypass Shell adoption. Existing active legacy services that remain marked `pending` are migration debt and are allowed only by the explicit legacy exception in `scripts/validate-ekodi-shell-adoption.mjs`. They must be migrated through staging and guarded release rather than relabeled without verification.

## Release model

A production-impacting change follows:

`source change → validation → automated tests → staging → guarded promotion → real-host verification → monitoring/audit`

The repository intentionally disables selected direct production deployment commands. Guarded Worker and Pages release scripts run provider-independence gates, and CI explicitly tests `AI_PROVIDER=NONE`.

## Security model

- Browser-side provider or privileged secrets are forbidden.
- Production origins are explicitly allow-listed where required.
- Administrator surfaces retain restrictive security headers and no-store behavior.
- Tenant and platform data boundaries are preserved.
- Privileged agent actions pass mission governance.
- Security-sensitive changes are auditable.
- Shared runtimes receive wider regression review than isolated service code.

## Automated acceptance gates

The repository verifies, where applicable:

- syntax and source integrity;
- business/platform boundaries;
- deployment guardrails;
- mission governance;
- AI provider independence;
- no-provider survival;
- user UI DNA;
- security baseline;
- EKODI Shell adoption;
- platform and product tests.

`test/sustainable-operating-model.test.mjs` provides a regression gate for the overall administrator/user split, identity model, provider-independent core, guarded release path, and presence of staging configurations.

## Data ownership

| Data / concern | System of record / owner |
|---|---|
| Person identity and session | shared authentication layer |
| Active Workspace context | My EKODI / shared identity contract |
| Platform-private business data | owning platform / tenant |
| AI provider policy | `config/ai-provider-independence.json` |
| Service identity and Shell adoption | `ekodi-service-manifest.js` |
| Platform deployment boundaries | `platform-boundaries.json` |
| DNS and operational controls | administrator control plane / Cloudflare integration |
| Audit history | shared operational audit store |
| Service availability | monitoring workflows and runtime health endpoints |

## Definition of done

For business-critical changes, completion means more than a green commit:

1. source validation passes;
2. automated tests pass;
3. mission and security policy passes where applicable;
4. staging succeeds;
5. guarded deployment succeeds;
6. the real public hostname is verified;
7. redirect behavior is verified when routing changed;
8. administrator observability remains intact;
9. failure remains visible through monitoring or audit;
10. user agency and tenant boundaries remain intact.

## Current migration status

The sustainable architecture is established in code and policy. My EKODI, the administrator control plane, provider-independent AI runtime, guarded release scripts, Shell policy, and staging configurations exist in the repository.

Some legacy active services still declare `shellIntegration: pending`. These are explicitly tracked migration debt, not evidence that the architecture contract is absent. Their integration should be completed incrementally with isolated staging and production verification.
