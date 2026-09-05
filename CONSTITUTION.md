# EKODI Platform Constitution v1.8.0

Effective: 2026-09-05

This constitution is the highest architecture and operations rule for EKODI Platform. Existing validators remain authoritative implementation guards; this document unifies their intent and governs future changes.

## 1. Architecture Constitution
- EKODI Core owns identity linkage, tenant/workspace, membership/RBAC, business state, configuration, automation and audit truth.
- Start as a modular monolith with explicit module contracts. Split services only for measurable scale, security, regulatory or fault-isolation needs.
- Reuse an existing capability or shared runtime before creating a new independent service, deployment boundary or dedicated subdomain.
- External providers are integrations, not the platform identity.
- Heavy or retryable work uses queue/worker execution rather than long synchronous requests.

## 1A. Governance, OS, Core, Service, Connection and Workspace Constitution
- The canonical operating principle is **Integrated responsibility, distributed execution, standardized connections** (`통합된 책임, 분산된 실행, 표준화된 연결`).
- Governance owns constitution, policy, responsibility, approval and change-control authority.
- EKODI OS defines platform-wide execution order, orchestration, routing context, service cooperation and guarded operational coordination. OS is an operating model, not a business service.
- EKODI Core implements the stable shared contracts and controls required for independent capabilities to cooperate safely, including identity and authorization contracts, immutable `workspace_id` authority, service contracts, integration gateways, audit, security policy, provider independence and shared fallback rules.
- An **EKODI Responsible Independent Service** is an EKODI-offered capability for which EKODI remains responsible for service quality, security, privacy controls, observability, fallback design, maintenance and user protection while preserving an explicit service boundary and independent lifecycle readiness.
- An **External Connected Service** remains the responsibility of its external provider for provider-side availability and internal operation. EKODI remains responsible for the connector contract, authorization scope, minimum data projection, error handling, retry, fallback or degraded path, user-facing connection status and safe disconnection.
- A Workspace is a person, organization, group or project operating context identified by immutable `workspace_id`. A Workspace is not a service implementation and must survive service replacement or disconnection without identity loss.
- Modular monolith is the default deployment topology, while Responsible Independent Service is a responsibility and capability boundary. They are complementary, not competing, concepts. A service may remain in a shared deployment while its contract, data boundary and extraction path stay explicit.
- Cross-boundary access uses public or explicitly declared APIs, events, webhooks, adapters or equivalent reviewed contracts. Direct private database coupling across Responsible Independent Service boundaries is forbidden.
- The same capability may have more than one compatible implementation, including an EKODI implementation and one or more external implementations. User choice, workspace policy or EKODI Orchestrator policy may select or combine compatible implementations within authorization, privacy, quality, cost, availability and safety constraints.
- External implementations never gain direct private database access merely by implementing a capability contract. They receive the minimum purpose-bound projection and capability-scoped authorization required for the task.
- Machine-readable architecture authority is `governance/architecture/ekodi-os-architecture.json`; `platform-boundaries.json` remains the deployment-boundary registry and does not by itself define responsibility ownership.

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
- `marketing.ekodi.kr` is the registered EKODI Marketing Core engine boundary. It is not the ordinary product or customer entry; the product entry is `ekodi.kr/ekodibiz/marketing-ai`, and workspace marketing uses `ekodi.kr/{slug}/marketing`.
- `ai.ekodi.kr` is the registered provider-independent AI Gateway/Core boundary. Customer-specific `*.ai.ekodi.kr` addresses are compatibility execution aliases only and must not be presented as canonical user URLs.
- Existing feature subdomains are legacy aliases unless explicitly registered as current system/common/core service boundaries. No new convenience or tenant-specific subdomain may be added without a constitutional amendment and the sustainable boundary-creation gate.
- Customer-owned domains map to a workspace public surface and never redefine EKODI internal identity, `workspace_id` or private routing.
- CGMA uses `https://ekodi.kr/cgma` as its EKODI platform route and `https://cgma.or.kr` as its customer-owned public address; legacy `cgma.ekodi.kr` is compatibility-only.

## 3. Identity and Tenant Constitution
- EKODI `user_id` is canonical. Google, Microsoft, email and future identities are linked identities.
- Tenant/workspace membership and authorization are canonical EKODI data.
- Provider groups or accounts may synchronize with EKODI but cannot become the authorization source of truth.
- Protected requests resolve authentication, tenant, authorization, rate policy and input validity before business logic.
- `Workspace` is the canonical operating-context term. Legacy `Space` terminology may remain only as a compatibility surface during migration and must not create a second identity, authority or routing model.

## 4. Data and Storage Constitution
- Structured core/operational truth lives in an EKODI-controlled database with tenant isolation and auditability.
- Google Workspace is preferred for human collaboration documents, not canonical EKODI identity/permission/business tables.
- R2 or S3-compatible object storage is preferred for system assets, uploads, delivery objects, staging and backup copies.
- Every external object keeps EKODI metadata linking tenant, workspace, owner, provider and provider object ID.
- Provider export or migration must remain possible without changing EKODI canonical IDs.

## 5. Provider Constitution
- Use free tiers first, but never make a free quota the architectural ceiling.
- Google Workspace is a collaboration provider; Cloudflare is edge/system-object infrastructure; AI vendors are replaceable compute providers.
- Use gateways where provider churn or critical dependency justifies them: identity, AI, storage and communications.
- Use lightweight adapters for lower-risk integrations rather than universal abstraction.
- A provider outage must degrade only its dependent capability where practical.
- Paid capacity, reserved capacity or enterprise commitments require measured operational value, sustainable funding, security/legal necessity or a documented reliability requirement; speculative scaling is forbidden.

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
- Existing deployment boundaries are preserved as the migration baseline. New independent deployment boundaries are exceptional and require the sustainable boundary-creation gate defined by the evolution model.
- Capacity expansion follows the order: remove root cause -> optimize cache/query/workload shape -> queue/retry heavy work -> increase shared capacity -> isolate only measured bottlenecks -> add redundancy only when justified.

## 9. Change Constitution
- **C0**: operational parameter change with no constitutional impact. Automated validation may apply it.
- **C1**: backward-compatible implementation change. CI validation is mandatory.
- **C2**: constitution, domain topology, source-of-truth or core-provider policy change. Propose first, obtain explicit owner confirmation, record amendment, bump version, define rollback, then apply.
- **C3**: breaking domain/security/data architecture change. C2 requirements plus migration plan, staged rollout and rollback proof are mandatory.
- Protected constitutional files must not be silently changed as part of unrelated work.

## 10. Legacy Migration Rule
Workspace type-prefixed public routes are retired and are not part of the runtime routing grammar. Any maintained `space.ekodi.kr` or `user.ekodi.kr` workspace alias maps a workspace slug directly to `ekodi.kr/{slug}`. Workspace type remains internal metadata bound to immutable `workspace_id`; it is not a public path component. Root-route collisions are prevented by the platform route registry and verified before release.

## 11. Enforcement
`npm run validate:constitution` validates this constitution against `platform-boundaries.json`, data/storage policy, evolution policy and governance records. `npm run validate:architecture` validates the Governance -> OS -> Core -> Responsible Independent Service -> External Connected Service -> Workspace responsibility registry, capability-routing rules and sustainable boundary-growth rules. `npm run check` includes both. GitHub CI runs the same checks on constitutional and platform changes.

Machine-readable constitutional authority: `governance/constitution/constitution.json`.
Machine-readable architecture authority: `governance/architecture/ekodi-os-architecture.json`.
Machine-readable sustainable evolution authority: `governance/architecture/ekodi-evolution-model.json`.

## 12. Verification-First Intelligent Evolution Constitution
- EKODI is a verification-first, security-native and continuously evolving intelligent platform; novelty alone is never an adoption reason.
- Evolution Intelligence continuously combines internal traffic, latency, error, capacity, cost, security and operational signals with current external standards, official technical material, research, benchmarks and security advisories.
- Every published platform recommendation includes traceable evidence and clickable source links where a linkable source exists; unsupported recommendations remain internal and are not presented as verified guidance.
- Important recommendations are cross-verified across independent sources and record source title, publisher, version or publication date when available, verification time, supported claim, alternatives, risks and confidence.
- Security is a core platform capability: least privilege, Zero Trust boundaries, strong authentication and authorization, secrets protection, encryption, auditability, tenant isolation, sandboxing, supply-chain checks, AI/agent identity, tool and data boundary protection, anomaly detection, isolation, rollback, backup and recovery are designed into shared control layers.
- Technology selection prioritizes verified maturity, security, interoperability, operational reliability, provider independence, replaceability, cost efficiency and measured EKODI fit over vendor claims or fashion.
- Capacity and traffic recommendations prefer root-cause and structural improvement before raw resource expansion: cache, query optimization, asynchronous queues, fault isolation, routing, autoscaling and data architecture are compared with cost and rollback evidence.
- Low-risk observation, analysis, forecasting and sandbox work may run automatically. Bounded production changes classified A3 may also run automatically only inside the Sovereign Autonomy Envelope and guarded release pipeline. A4 sovereign changes such as constitution, rights, authority expansion, unbudgeted paid commitments, irreversible or mass data changes, new domain ownership/security boundaries, provider lock-in and new independent deployment require EKODI Platform Super Administrator approval.
- `EKODI Evolution Intelligence` recommends; it never becomes sovereign authority. Final platform authority remains the EKODI Platform Super Administrator.

## 13. Sustainable 8-Generation Evolution Constitution
- EKODI's current architectural generation is **Generation 2: Integrated Platform**, with an active transition toward **Generation 3: Capability Platform**. Generation labels describe maturity and direction, not marketing claims.
- EKODI's constitutional north star is **Generation 8: Living Digital Commons**: people, organizations, communities and projects share reusable digital capabilities without surrendering identity, data or policy sovereignty, under durable governance and sustainable economics.
- The canonical generation path is: **1 Service Collection -> 2 Integrated Platform -> 3 Capability Platform -> 4 Intent OS -> 5 Agentic OS -> 6 Federated Ecosystem -> 7 Self-Evolving Ecosystem -> 8 Living Digital Commons**.
- Generation advancement is evidence-driven, not date-driven. A later generation must not bypass incomplete identity, authorization, security, observability, cost or rollback foundations from an earlier generation.
- Current operations default to **S0 Seed** economics: free or lowest safe tiers, shared runtime, shared infrastructure and cache-first delivery where security and isolation permit.
- **S1 Validated** expansion is allowed when sustained demand, repeated capacity pressure, early recurring revenue/committed funding, or a verified security/reliability need justifies incremental cost.
- **S2 Growth** allows dedicated service/runtime/data boundaries when shared infrastructure is a measured bottleneck, fault isolation has measurable value, stronger isolation is required, and the incremental cost has justified unit economics or mission value.
- **S3 Scale** allows advanced redundancy, multi-region architecture, dedicated clusters/datastores or enterprise commitments only for large sustainable revenue, committed institutional funding, regulatory/contractual requirements or critical public-interest operation.
- Revenue is not the only reason to scale: security, legal, privacy, backup, recovery and reliability requirements may require paid capacity earlier. Such exceptions remain explicitly justified and approved.
- New capability development follows **reuse before creation**. New independent deployment follows **shared before dedicated**. New provider adoption follows **adapter/gateway before lock-in**.
- Existing independent deployment boundaries are grandfathered as a migration baseline and are reviewed for convergence before expansion. Their existence is not precedent for creating additional boundaries.
- The canonical operating-context target is **Person + Workspace + Membership + Capability**. Legacy `Space` names may remain only as migration aliases and must converge without breaking `workspace_id`.
- Machine-readable rules, scale tiers, boundary gates and generation definitions are maintained in `governance/architecture/ekodi-evolution-model.json` and are enforced by repository validators.


## 14. Sovereign Autonomous Operations Constitution
- The EKODI Platform Super Administrator remains the sovereign human authority. EKODI Autonomous Control Plane receives delegated execution authority but never sovereign authority.
- AI providers, agents and development workers are replaceable executors. Provider or model identity never grants authority.
- Autonomy levels are **A0 Observe**, **A1 Analyze/Assist**, **A2 Reversible Non-Production**, **A3 Bounded Production**, **A4 Sovereign/High-Impact**, and **A5 Forbidden**. A0-A3 may execute automatically when their policy requirements pass; A4 requires the sovereign user's decision; A5 never executes.
- A3 requires explicit delegated scope, an existing registered boundary, preflight verification, reversible or safe degraded operation, a guarded candidate/canary path, post-execution verification, auditability, and a known safe rollback target. Failed A3 releases roll back automatically and verify the rollback.
- A3 never expands permissions, changes canonical identity/workspace authority, performs irreversible or mass destructive data changes, creates a new domain ownership/security boundary, creates a new independent deployment, or enters a new paid commitment without an explicit delegated budget.
- No numeric budget is inferred from silence. Until a budget envelope is explicitly delegated, a new paid commitment remains A4. Security, legal and reliability work may still be proposed urgently, but the commitment boundary remains sovereign.
- Reversible configuration of an existing registered route, safe same-scope operations, capacity tuning within an explicit budget, verified guarded deployment, provider failover, health recovery and safe rollback may be A3.
- Generation 3-7 operating patterns may be adopted early on shared S0 infrastructure when they preserve prior-generation foundations. Formal generation promotion remains evidence-driven and an A4 constitutional decision.
- Machine-readable authority: `governance/architecture/ekodi-sovereign-autonomy.json`. Runtime classification: `sovereign-autonomy-policy.js`.
