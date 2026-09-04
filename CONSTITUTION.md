# EKODI Platform Constitution v1.6.0

Effective: 2026-09-04

This constitution is the highest architecture and operations rule for EKODI Platform. Existing validators remain authoritative implementation guards; this document unifies their intent and governs future changes.

## 1. Architecture Constitution
- EKODI Core owns identity linkage, tenant/workspace, membership/RBAC, business state, configuration, automation and audit truth.
- Start as a modular monolith with explicit module contracts. Split services only for measurable scale, security or isolation needs.
- External providers are integrations, not the platform identity.
- Heavy or retryable work uses queue/worker execution rather than long synchronous requests.

## 2. Domain Constitution
- The apex `ekodi.kr` is the canonical public ecosystem entry point and canonical host for user-operated public spaces.
- Stable production system boundaries include `my.ekodi.kr`, `admin.ekodi.kr`, `auth.ekodi.kr`, `api.ekodi.kr` and `status.ekodi.kr` in addition to `ekodi.kr`.
- Development mirrors those boundaries under `*.dev.ekodi.kr`.
- Subdomains represent justified system, security, protocol, common-service or core-service boundaries. They must not represent person, organization, group or project identity.
- Canonical public user-space addresses use the universal root pattern `ekodi.kr/{slug}`. Workspace kind is internal metadata and is never encoded into the public URL.
- Workspace child services use `ekodi.kr/{slug}/{service}`; workspace administration uses `ekodi.kr/{slug}/admin` or `ekodi.kr/{slug}/{service}/admin`. Root slugs reserved for platform, common-service or core-service routes cannot be claimed by a workspace.
- `space.ekodi.kr`, `user.ekodi.kr` and per-tenant subdomains are not canonical workspace addresses. If such aliases exist, they must redirect to the corresponding `ekodi.kr` path while preserving the remaining path where practical.
- `my.ekodi.kr` remains the personal authenticated home/control surface and may present workspace participation, switching and private controls without becoming the canonical public workspace address.
- Public and private routing resolve tenant/workspace authorization from immutable `workspace_id`; URL host, path and slug are routing locators, not identity or authorization truth.
- Common services and core services may keep or receive dedicated subdomains only when security, operational isolation, protocol separation or independently managed service boundaries justify them and the domain is registered in constitutional governance.
- `journal.ekodi.kr` is a registered common-service boundary for the EKODI living journal. It does not represent workspace identity; personal and tenant journal surfaces remain under their canonical `ekodi.kr` workspace paths and resolve authority from immutable `workspace_id`.
- `try.ekodi.kr` is a registered common-service boundary for the EKODI Experience service. It exposes synthetic data and sanitized public projections only; it is never a workspace identity, production-data mirror or internal architecture surface.
- `invest.ekodi.kr` is the registered common Invest Core for Evidence-First research, diligence, IR and connection support; workspace-specific investment businesses remain under `ekodi.kr/{slug}/invest`.
- Existing feature subdomains are legacy aliases unless explicitly registered as current system/common/core service boundaries. No new convenience or tenant-specific subdomain may be added without a constitutional amendment.
- Customer-owned domains map to a workspace public surface and never redefine EKODI internal identity, `workspace_id` or private routing.

## 3. Identity and Tenant Constitution
- EKODI `user_id` is canonical. Google, Microsoft, email and future identities are linked identities.
- Tenant/workspace membership and authorization are canonical EKODI data.
- Provider groups or accounts may synchronize with EKODI but cannot become the authorization source of truth.
- Protected requests resolve authentication, tenant, authorization, rate policy and input validity before business logic.

## 4. Data and Storage Constitution
- Structured core/operational truth lives in an EKODI-controlled database with tenant isolation and auditability.
- Google Workspace is preferred for human collaboration documents, not canonical EKODI identity/permission/business tables.
- R2 or S3-compatible object storage is preferred for system assets, uploads, delivery objects, staging and backup copies.
- Every external object keeps EKODI metadata linking tenant, workspace, owner, provider and provider object ID.
- Provider export or migration must remain possible without changing EKODI canonical IDs.

## 5. Provider Constitution
- **Portable Cloud First**: use cloud services when they provide verified operational value, while every cloud provider remains replaceable execution or integration infrastructure rather than EKODI's architectural owner.
- Use free tiers and credits first when useful, but price incentives never determine architecture, canonical identifiers or source-of-truth placement.
- Google Workspace is a collaboration provider; Cloudflare is edge/system-object infrastructure; Google Cloud, AWS and other clouds may serve as replaceable compute, database or object providers; AI vendors are replaceable compute providers.
- No provider may own EKODI canonical user/workspace IDs, authorization truth, core business logic, orchestration authority or a non-exportable canonical data format.
- Critical provider-native APIs are consumed behind EKODI gateways or adapters. Prefer open or widely portable contracts such as HTTP, OAuth/OIDC, OCI, PostgreSQL and S3-compatible object semantics.
- EKODI is multi-provider ready, not active-active multi-cloud by default. One primary provider per capability is acceptable when an exit path, alternate target and rollback are verified.
- Use lightweight adapters for lower-risk integrations rather than universal abstraction.
- A provider outage must degrade only its dependent capability where practical, and critical providers require a documented export, restore and credential-revocation exit plan.

## 6. Security and Traffic Constitution
- Internet traffic reaches EKODI through the edge security boundary before origin services.
- Public origin, database, Redis, SSH/RDP and privileged administration endpoints are forbidden.
- Admin uses a stronger access boundary than ordinary user surfaces.
- Public content is cache-first; private/admin responses are restricted or no-cache.
- Edge controls absorb volumetric abuse; EKODI enforces user, tenant, capability and cost-aware limits.
- Login, signup, upload, AI and other abuse-sensitive endpoints receive dedicated throttling and verification.
- User, administrator, experience and operational-AI surfaces use purpose-bound secure projection: secrets and source/topology details are never sent to a surface that does not need them.
- Browser hiding is not a security boundary; restricted fields are removed server-side before serialization. View, export, download, API and raw-data capabilities are separately authorized.
- Administrator surfaces default to a safe projection. Any deeper diagnostic access remains separately authorized, time-bounded where practical and auditable, and never reveals reusable secrets.

## 7. AI Constitution
- AI calls route through provider-independent governance when a gateway exists.
- AI never owns EKODI identity, authorization, payment or irreversible high-impact decisions.
- Operational AI receives only the minimum projected context required for the task. Canonical personal identifiers, credentials and internal source/topology details stay inside EKODI unless a separately governed engineering workflow explicitly requires them.
- Expensive AI work has quota, timeout, retry, circuit-breaker and fallback behavior.
- Provider unavailability must retain a safe degraded or non-AI path where the service permits it.

## 7A. Parallel Development Constitution
- Claude Code, ChatGPT/GPT, Codex, Gemini, Copilot, future AI development agents and human developers follow the same provider-neutral development contract.
- Every task has a unique task ID, independent branch and independent Git worktree or equivalent isolated sandbox.
- Concurrent tasks must not share one mutable working directory.
- AI agents and ordinary development workers must not directly write or force-push to main, release or production branches.
- Production deployment must not originate directly from an agent task workspace.
- All production-bound changes pass the central validation, review, merge and guarded deployment pipeline.
- Agent/provider identity never grants bypass authority. Production credentials remain outside ordinary agent worktrees.
- Conflicts and failures are isolated to the task branch/worktree; central integration decides merge order and revalidation.

## 8. Deployment and Operations Constitution
- Production writes stay behind guarded release controllers, staging/candidate validation and rollback capability.
- Shared-edge or topology changes are manual, serialized and regression-tested across every affected route.
- A full-ecosystem workflow is verification-oriented, not a shortcut around service release gates.
- Health, smoke and boundary checks must pass before a release is considered complete.
- Secrets remain server-side and credentials are capability-scoped with least privilege.

## 9. Change Constitution
- **C0**: operational parameter change with no constitutional impact. Automated validation may apply it.
- **C1**: backward-compatible implementation change. CI validation is mandatory.
- **C2**: constitution, domain topology, source-of-truth or core-provider policy change. Propose first, obtain explicit owner confirmation, record amendment, bump version, define rollback, then apply.
- **C3**: breaking domain/security/data architecture change. C2 requirements plus migration plan, staged rollout and rollback proof are mandatory.
- Protected constitutional files must not be silently changed as part of unrelated work.

## 10. Legacy Migration Rule
Workspace type-prefixed public routes are retired and are not part of the runtime routing grammar. Any maintained `space.ekodi.kr` or `user.ekodi.kr` workspace alias maps a workspace slug directly to `ekodi.kr/{slug}`. Workspace type remains internal metadata bound to immutable `workspace_id`; it is not a public path component. Root-route collisions are prevented by the platform route registry and verified before release.

## 11. Enforcement
`npm run validate:constitution` validates this constitution against `platform-boundaries.json`, data/storage policy and governance records. `npm run check` includes it. GitHub CI runs the same check on constitutional and platform changes.

Machine-readable authority: `governance/constitution/constitution.json`.

## 12. Verification-First Intelligent Evolution Constitution
- EKODI is a verification-first, security-native and continuously evolving intelligent platform; novelty alone is never an adoption reason.
- Evolution Intelligence continuously combines internal traffic, latency, error, capacity, cost, security and operational signals with current external standards, official technical material, research, benchmarks and security advisories.
- Every published platform recommendation includes traceable evidence and clickable source links where a linkable source exists; unsupported recommendations remain internal and are not presented as verified guidance.
- Important recommendations are cross-verified across independent sources and record source title, publisher, version or publication date when available, verification time, supported claim, alternatives, risks and confidence.
- Security is a core platform capability: least privilege, Zero Trust boundaries, strong authentication and authorization, secrets protection, encryption, auditability, tenant isolation, sandboxing, supply-chain checks, AI/agent identity, tool and data boundary protection, anomaly detection, isolation, rollback, backup and recovery are designed into shared control layers.
- Technology selection prioritizes verified maturity, security, interoperability, operational reliability, provider independence, replaceability, cost efficiency and measured EKODI fit over vendor claims or fashion.
- Capacity and traffic recommendations prefer root-cause and structural improvement before raw resource expansion: cache, query optimization, asynchronous queues, fault isolation, routing, autoscaling and data architecture are compared with cost and rollback evidence.
- Low-risk observation, analysis, forecasting, scoring and sandbox experiments may run automatically within delegated limits. Production changes, shared-core creation, permission expansion, paid commitments, data migration, destructive changes, security-boundary changes and production DNS changes require EKODI Platform Super Administrator approval and the guarded release pipeline.
- `EKODI Evolution Intelligence` recommends; it never becomes sovereign authority. Final platform authority remains the EKODI Platform Super Administrator.
