# EKODI Platform Constitution v1.26.0

Effective: 2026-09-27

This constitution is the highest architecture and operations rule for EKODI Platform. Existing validators remain authoritative implementation guards; this document unifies their intent and governs future changes.

## 0. Supreme Ecosystem Attributes Constitution
- The following **21 Supreme Attributes** are the highest non-optional quality constraints of the EKODI ecosystem and bind Generation 10 and every future generation: **Independence, Modularity, Scalability, Standardization, Consistency, Collaboration, Agility, Creativity, Security, Evolvability, Adaptability, Replaceability, Reversibility, Resilience, Observability, Verifiability, Interoperability, Data Sovereignty, Autonomous Operations, Economic Sustainability, Simplicity**.
- In Korean canonical terms: **독립성 · 모듈성 · 확장성 · 표준성 · 일관성 · 협업성 · 신속성 · 창조성 · 보안성 · 진화가능성 · 적응성 · 교체가능성 · 가역성 · 회복탄력성 · 관측가능성 · 검증가능성 · 상호운용성 · 데이터주권 · 자율운영성 · 경제적 지속가능성 · 단순성**.
- These attributes apply to governance, architecture, source code, AI/agent behavior, data, security, UX, integrations, infrastructure, operations, cost decisions and future-generation evolution.
- They are **supreme-mandatory**: no implementation, provider, AI agent, individual service or workspace may silently waive, locally override or regress them. An exception requires an explicit constitutional amendment under C2/C3 authority.
- The attributes are optimized as one system rather than traded away independently. Tensions must be documented and evidence-based; security, data sovereignty and sovereign human authority are mandatory floors that no tradeoff may reduce.
- The operating maxim is: **independent yet connected; consistent without uniformity; stable without rigidity; creative without losing control; fast without becoming reckless; extensible without uncontrolled complexity**.
- Machine-readable authority: `governance/constitution/supreme-attributes.v1.json`. Repository validation and CI must fail when the registry, constitutional binding or required enforcement mappings regress.

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

## 1B. Sovereign Autonomous Operations Constitution
- EKODI v1.8 introduced the operating hierarchy **Sovereign → Autonomous → Agentic → Services**. Operating-architecture version and architectural generation are separate axes; the current generation is governed by Section 13 and the evolution registry, while scale remains independently governed by the S0-S3 evidence gates.
- Sovereign authority owns constitution, identity, policy, authorization, audit and final control authority. AI, providers and services never become sovereign actors.
- Every autonomous execution resolves the canonical authority context **Person + Workspace + Role + Capability**. Missing context permits analysis but not implicit execution authority.
- Autonomous Operations follow **Observe → Detect → Reason → Plan → Execute → Verify → Recover → Learn**. Execution is never complete until verification succeeds; failed verification enters recovery or a safe degraded state.
- Learning may propose better policy, routing, capacity or automation, but it may not expand its own authority, bypass a human gate or silently change constitutional policy.
- UI, Service, Tenant, Knowledge, Content and Agent are the six parallel surface tracks. Green work is parallel-safe when delegated, reversible, audited and preflight-verified. Yellow work additionally requires an explicit contract, rollback and verification definition. Red Sovereign/Core work requires independent human authority and governed promotion.
- Auth, identity authority, core schema, gateway, policy, secrets, production deployment, production DNS, destructive data operations, permission expansion and constitutional changes are Red areas by default.
- Production application mutation remains verified immutable promotion only. Agent task workspaces may prepare and verify candidates but may not directly mutate production.
- Shared-before-dedicated, capability-first reuse and no-speculative-scale remain binding. v1.8 does not justify infrastructure expansion without measured demand, sustainable funding or a documented security/legal/reliability requirement.
- Machine-readable authority is `governance/architecture/sovereign-autonomous-operations.v1.json`; cross-cutting surface policy is `config/sovereign-surface-policy.json`.

## 1C. Capability Before Service Constitution
- EKODI accumulates and verifies reusable capabilities before creating or registering a new user-facing service. A useful idea, learned pattern or discovered need does not by itself justify another service.
- Every new user-facing service follows: **existing Capability search → Capability gap analysis → Foundry module creation when needed → synthetic Sample Service validation → repeated verification → real demand confirmation → Super Administrator packaging review → service registration**.
- Existing Capability reuse is mandatory to evaluate first. When a Capability gap exists, the missing ability is built and verified in the Capability Foundry before it is packaged as a user service.
- A new service requires at least **three distinct verified synthetic sample runs** before packaging review. Sample success proves technical composability only; it does not by itself prove that a service should exist.
- Service demand must be supported by an explicit user request, measured recurring need, or a documented security/legal/reliability requirement. Speculative service creation is forbidden.
- Automatic creation of a user-facing service by AI, Learning Loop, Discovery Engine, Foundry or Orchestrator is forbidden. Final packaging approval belongs to the EKODI Platform Super Administrator.
- Services already registered at the adoption of v1.24.0 are grandfathered only as a fixed baseline. Expanding that grandfather list requires another constitutional amendment and may not be used to bypass the evidence gate.
- A new service outside the grandfathered baseline without governed creation evidence is a CI failure. A new independent deployment boundary must additionally pass the sustainable boundary-creation gate.
- Machine-readable authority: `governance/constitution/constitution.json` -> `capabilityFirstServiceCreationPolicy`. Evidence registry: `config/service-creation-evidence.json`. Enforcement: `scripts/validate-capability-first-service-creation.mjs`.

## 1D. Mandatory Automatic Execution Lifecycle Constitution
- **AUTOMATIC-EXECUTION-LIFECYCLE-001** is a mandatory EKODI execution rule for every current and future automatic API, browser, remote-computer, isolated-desktop and equivalent agent execution path.
- Automatic execution defaults to **background-only**. It must not create, focus, hijack or close a user-owned browser tab, window or interactive desktop surface.
- EKODI-owned temporary automation surfaces must be isolated and must close automatically when work completes, fails terminally, is cancelled, or reaches an authentication boundary that cannot be completed without human action.
- `AUTH_REQUIRED` is a terminal background state: record it, preserve evidence, close the EKODI-owned temporary surface, and do not open an interactive login window automatically.
- Background API execution is preferred over browser automation for API-status or machine-readable checks.
- Foreground interaction is permitted only for bounded human-required steps: OAuth/provider consent, CAPTCHA/human verification, hardware-backed authentication, or OS privileged consent. The foreground exception never grants the automation authority to control or close unrelated user-owned windows or tabs.
- Service-local, agent-local, provider-local, workspace-local and learning-loop overrides are forbidden. A regression of this lifecycle is a CI failure.
- The rule binds `config/remote-computer-execution-policy.json`, `config/autonomous-execution-fabric-policy.json`, `config/virtualization-routing-policy.json`, the background-browser policy, Hybrid Execution, Remote Computer Provider, Virtualization Router, Device Control and the EKODI Windows Agent.
- Changes that weaken or waive this rule are constitutional changes and require the EKODI Platform Super Administrator's explicit approval, an amendment record, a version bump, rollback definition and governed promotion.

## 2. Domain Constitution
- The apex `ekodi.kr` is the canonical public ecosystem entry point and canonical host for user-operated public spaces.
- `ekodi.kr` is the canonical human and management host. Existing system subdomains may remain only as internal execution, protocol, emergency or compatibility boundaries and are not canonical user entry points.
- Development mirrors production system boundaries on nested `*.dev.ekodi.kr` hosts such as `my.dev.ekodi.kr`, `admin.dev.ekodi.kr`, `auth.dev.ekodi.kr` and `api.dev.ekodi.kr`; the root `dev.ekodi.kr` is reserved for the public EKODI Developer portal.
- Subdomains represent justified system, security, protocol, common-service or core-service boundaries. They must not represent person, organization, group or project identity.
- Canonical public user-space addresses use the universal root pattern `ekodi.kr/{slug}`. Workspace kind is internal metadata and is never encoded into the public URL.
- Workspace child services use `ekodi.kr/{slug}/{service}`. Every independently managed site uses its own public canonical path plus `/admin`: a Workspace uses `ekodi.kr/{slug}/admin`, and a child site or service uses `ekodi.kr/{slug}/{service}/admin`. The URL is a routing locator only; authorization still resolves from immutable identity and Person + Workspace + Role + Capability.
- `ekodi.kr/admin` is the EKODI Platform Super Administrator control plane. It may aggregate directory, status, observability, search and explicit handoff to lower administrators, but it must not create an alternate lower-site administrator URL such as `/admin/{site}` or `/{parent}/admin/{child-site}`. Parent administrators follow the same rule.
- Platform-owned administrator internal navigation keeps the five management work areas `/admin/home/*`, `/admin/operations/*`, `/admin/workspaces/*`, `/admin/services/*`, and `/admin/system/*`. These paths govern platform-owned capabilities and are not substitute operational admin URLs for independently managed sites. Legacy or aggregate lower-admin aliases may redirect during migration but must never render the lower administrator UI.
- `space.ekodi.kr`, `user.ekodi.kr` and per-tenant subdomains are not canonical workspace addresses. If such aliases exist, they must redirect to the corresponding `ekodi.kr` path while preserving the remaining path where practical.
- `ekodi.kr/my` is the canonical personal authenticated home. `my.ekodi.kr` may remain temporarily as a compatibility or internal execution boundary only.
- Public and private routing resolve tenant/workspace authorization from immutable `workspace_id`; URL host, path and slug are routing locators, not identity or authorization truth.
- Common services and core services may keep or receive dedicated subdomains only when security, operational isolation, protocol separation or independently managed service boundaries justify them and the domain is registered in constitutional governance.
- `journal.ekodi.kr` is a registered common-service boundary for the EKODI living journal. It does not represent workspace identity; personal and tenant journal surfaces remain under their canonical `ekodi.kr` workspace paths and resolve authority from immutable `workspace_id`.
- `exp.ekodi.kr` is the canonical registered common-service boundary for EKODI Experience. It exposes synthetic data and sanitized public projections only; it is never a workspace identity, production-data mirror or internal architecture surface. Legacy `try.ekodi.kr` permanently redirects to `exp.ekodi.kr`.
- `dev.ekodi.kr` is the registered public EKODI Developer and Conformance portal. It exposes public integration contracts, examples and browser-local preflight validation only; private repository structure, secrets, production customer data and internal provider topology remain excluded.
- `invest.ekodi.kr` is the registered common Invest Core for Evidence-First research, diligence, IR and connection support; workspace-specific investment businesses remain under `ekodi.kr/{slug}/invest`.
- `marketing.ekodi.kr` is the registered EKODI Marketing Core engine boundary. It is not the ordinary product or customer entry; the product entry is `ekodi.kr/ekodibiz/marketing-ai`, and workspace marketing uses `ekodi.kr/{slug}/marketing`.
- `ai.ekodi.kr` is the registered provider-independent AI Gateway/Core boundary. Customer-specific `*.ai.ekodi.kr` addresses are compatibility execution aliases only and must not be presented as canonical user URLs.
- Existing feature subdomains are legacy aliases unless explicitly registered as current system/common/core service boundaries. No new convenience or tenant-specific subdomain may be added without a constitutional amendment and the sustainable boundary-creation gate.
- `https://ekodi.kr/support` is the sole canonical Support user entry. `support.ekodi.kr` is retired and is not retained as a compatibility redirect.
- Customer-owned domains map to a workspace public surface and never redefine EKODI internal identity, `workspace_id` or private routing.
- CGMA uses `https://ekodi.kr/cgma` as its EKODI platform route and `https://cgma.or.kr` as its customer-owned public address; legacy `cgma.ekodi.kr` is compatibility-only.

## 2A. Public User Surface Constitution
- Every canonical public user page is **guest-open by default**. A person must be able to reach and read the safe public projection without signing in.
- Authentication **enhances rather than replaces** the public experience. After sign-in, membership tier, workspace relationship, role and capability may add, personalize, enable or reorder content and actions, but they must not turn the canonical public page into a login wall.
- Authentication and authorization remain mandatory for private data, personal state, workspace-internal data, write actions, applications, payments, uploads, protected downloads, operator tools and administrator capabilities.
- A `401`, `403` or private-data lookup failure from a protected capability must degrade the interface back to the safe public projection. It must not replace a canonical public page with an access-denied, unavailable-workspace or equivalent permission screen.
- A private or closed surface is an exception, not a default. It requires explicit policy classification. Its canonical public root still returns a safe public landing or privacy notice without disclosing private existence, membership or data; protected content stays server-side.
- `guest_hidden` and equivalent visibility controls may hide discovery or explicitly private content, but they may not gate or replace the canonical public user-page shell.
- `/my`, administrator surfaces, authentication flows, private workspace tools and other explicitly protected routes may require authentication before rendering their private experience.
- Public routing, shared Shell, service UI and Workspace UI must enforce this rule consistently. Login state changes the projection and available capabilities, not the existence of the public page.
- **Public Visual Continuity is mandatory on every current and future user surface** (`public` and `workspace`; administrator and authentication control surfaces are excluded). Before first paint, decorative characters, illustrations, ambient scenes and other conditional visuals must resolve their intended visibility. An unresolved visual must remain hidden until its state is resolved; rendering it visibly and then removing it is a verification failure.
- Each top-level site entry or browser reload may select one **pre-approved, subtle background/ambient variation** within the active site's existing visual family. The selection is document-load scoped: it remains stable for the lifetime of that document and must not change again because of timers, ordinary clicks, scrolling, client-side interaction or authentication hydration.
- Per-load variation may change only low-impact ambient color tokens. It must not change service identity, information architecture, content order, navigation position, control geometry, font scale, contrast floor, authorization meaning or functional state. Random hues outside the approved site palette are forbidden; shared variation strength is capped by the machine policy and accessibility contrast remains mandatory.
- The shared Shell owns the provider-independent document-load seed, common ambient tokens and visual-ready signal. Services and subordinate user pages inherit the same contract rather than implementing independent randomizers. Reduced-motion/accessibility preferences and a safe fixed fallback remain mandatory.
- Machine-readable authority: `governance/constitution/constitution.json` -> `publicUserSurfacePolicy` and `config/service-workspace-policy.json` -> `publicUserSurfaceDefault`.

## 3. Identity and Tenant Constitution
- EKODI `user_id` is canonical. Google, Microsoft, email and future identities are linked identities.
- Tenant/workspace membership and authorization are canonical EKODI data.
- Provider groups or accounts may synchronize with EKODI but cannot become the authorization source of truth.
- Protected requests resolve authentication, tenant, authorization, rate policy and input validity before business logic.
- `Workspace` is the canonical operating-context term. Legacy `Space` terminology may remain only as a compatibility surface during migration and must not create a second identity, authority or routing model.

## 3A. Authentication Return Continuity Constitution
- Authentication is a temporary identity boundary, never a navigation destination. After successful sign-in, the user returns to the exact trusted page that initiated login whenever a valid `return_to` exists.
- Every EKODI site, Workspace, service, My page, operator page and administrator page preserves its own navigation context across authentication. A login initiated from one site must not silently land in another site's home, My page or the platform My EKODI hub.
- If an exact pre-login URL is unavailable, the initiating service may use its explicitly registered authenticated home or service-local My page; otherwise it falls back to that service's canonical entry. Cross-service fallback is forbidden.
- `https://ekodi.kr/my` is the canonical platform personal home and may be a login destination only for an authentication flow explicitly initiated for My EKODI or the apex EKODI portal. It is forbidden as a generic post-login fallback for other services, Workspaces or administrator surfaces.
- Workspace/service administrator login must return to the original canonical admin path, including its child section such as `/{slug}/admin/menu`, `/{slug}/admin/delivery` or `/{slug}/admin/connections`.
- One-time handoff tokens must be delivered directly to the intended destination when possible. If a token is accidentally delivered to My EKODI with a trusted non-My `return_to`, My EKODI must redirect it to that target before consuming the token.
- Return targets are allowlisted trusted HTTPS EKODI/customer-owned destinations with credential-bearing URLs rejected. Authentication must preserve query context but never propagate reusable secrets in query parameters.
- This rule applies to all current and future login adapters and is enforced by shared authentication routing tests and production system verification.
- Machine-readable authority: `governance/constitution/constitution.json` -> `authenticationReturnContinuityPolicy` and `config/service-workspace-policy.json` -> `authenticationReturnPolicy`.

## 3B. Canonical Human URL Query Hygiene Constitution
- Every current and future EKODI human-facing public, user, authentication and administrator surface uses a canonical address consisting of the canonical path plus only query parameters required for the page's actual function.
- Marketing and attribution parameters do not belong to the visible canonical address. On page navigation, EKODI removes `utm_*` and registered tracking keys such as `gclid`, `fbclid`, `msclkid`, `srsltid` and equivalent campaign identifiers.
- Functional query context is preserved. Parameters such as `return_to`, OAuth `code`/`state`, search, filter, pagination and other route-required values must never be removed merely to make the URL look clean.
- GET and HEAD human-surface requests are normalized at the shared edge before ordinary page routing. Shared Shell performs a browser-side `history.replaceState` cleanup as a fallback for compatible surfaces that bypass or predate the shared edge path.
- API, webhook, MCP, health and static-asset routes are not rewritten by this human-surface rule. Tracking parameters never define EKODI identity, authorization, Workspace selection or permission state.
- This rule applies equally to administrator and ordinary user pages, legacy human-entry aliases and all future EKODI human surfaces. Regression tests and production system verification must confirm both removal of tracking parameters and preservation of functional query context.
- Machine-readable authority: `governance/constitution/constitution.json` -> `canonicalUrlQueryPolicy`.

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

## 8A. Completion Continuity Constitution
- A session ending, execution-window limit, temporary tool unavailability, connector failure, rate limit or transient infrastructure failure is a **recoverable interruption**, not evidence of completion and not by itself a blocked state.
- Recoverable work records a checkpoint containing task/branch/commit identity, completed and pending steps, latest validation and deployment state, blocking dependency, next executable step and resume timestamp.
- The next authorized worker resumes from the checkpoint instead of restarting completed work or silently abandoning it.
- Before escalating a recoverable interruption, EKODI attempts an available authorized alternative path under Cloud First and existing provider-independent fallback rules.
- Continuity never expands authority, bypasses credentials, weakens safety gates or permits direct production mutation. A genuine blocked state is reserved for an authority, safety, credential, human-approval or external dependency that cannot be resolved within delegated authority.
- Commit, PR, merge, deployment, session termination or tool termination never substitutes for required production verification evidence.

## 8B. Universal Surface System Verification Constitution
- Every current and future EKODI surface that a guest, signed-in user, member, operator, administrator or super administrator can use inherits one verification contract. This includes every public home, workspace/service My page, operator page, workspace/service administrator page, the platform Super Administrator surface, and the canonical EKODI personal home at `ekodi.kr/my`.
- A change is not complete because source code, unit tests, a build, a pull request, a deployment or an HTTP status succeeded. Normal completion requires **System Verified** evidence from the real canonical production surface after guarded deployment.
- EKODI must verify these surfaces itself using synthetic actors and isolated browser/runtime virtualization or an equivalent automated execution method. Virtualization is a required available method for UI verification, but it is one method rather than the whole architecture; high-risk changes require independent evidence convergence where policy requires it.
- When virtualization, browser/computer-use automation, isolated desktop execution, or synthetic visual verification is required, **EKODI-owned virtualization is the default and must be attempted first** through the Autonomous Execution Fabric, EKODI Background Browser Worker, or EKODI Native Remote Computer capability as applicable.
- External virtualization/browser/computer-use providers are temporary, replaceable fallback adapters only. They may be used only when the required native capability is not production-ready, unavailable, not yet implemented, or has a verified capacity/runtime failure; the reason must be auditable, security/isolation may not be weakened, and paid external auto-upgrade is forbidden.
- A native capability gap discovered through external fallback is not normalized into a permanent dependency: EKODI must register the gap and build or complete the corresponding EKODI capability. Correctable native gaps must be recovered automatically without turning the user into the integration operator.
- The synthetic role matrix must cover, as applicable: guest, authenticated user, workspace member, operator, workspace/service administrator and platform super administrator. Verification must include valid, expired, invalid and insufficient-authority sessions as well as the authorized path.
- The device matrix must cover mobile portrait, mobile landscape, tablet and desktop. UI verification checks rendering, overflow, navigation, interaction, responsive behavior and a basic accessibility baseline rather than relying only on DOM existence or HTTP success.
- Natural-language copy is a protected responsive invariant: Korean and other natural-language words/eojeol must not be arbitrarily split for layout, layout-only hard line breaks are forbidden as a responsive technique, and technical identifiers may use anywhere-breaking only through an explicit exception.
- Every governed UI must reflow automatically across at least 320, 390, 768, 1366 and 1440px viewport widths. When space is constrained, layout reflow and information reprioritization happen before shrinking readable text; horizontal page overflow, clipped primary copy and overlapping primary controls are verification failures.
- EKODI design, copywriting and implementation work must check this responsive-content contract before completion. Repeated defects of this class are shared-guardrail defects, not page-local exceptions.
- System verification must check canonical routing, login/session behavior, URL/token hygiene, RBAC and capability boundaries, safe public projection, private-data isolation, functional actions, API/data contracts, secure projection, error handling, observability and the real production host canary.
- Production canaries use designated synthetic workspaces, test identities, non-destructive fixtures or reversible/idempotent writes. Verification must never weaken authorization, expose reusable secrets or perform destructive production mutation merely to make testing easier.
- Each verification run records machine-readable evidence including task/commit identity, surface and canonical URL, synthetic actor, device profile, authentication state, performed checks, production host, observability result, timestamp and result. UI-affecting changes retain screenshots or equivalent visual evidence.
- `SYSTEM_VERIFIED` is sufficient for normal completion. `DEPLOYED_AWAITING_SYSTEM_VERIFICATION`, `VERIFICATION_EXCEPTION` and `FAILED` are not completion states. A verification failure triggers repair -> retest -> redeploy -> reverify within delegated authority.
- Manual testing by the owner, administrator, operator, broadcaster, applicant, participant or ordinary user is additive evidence and is not the default completion gate. EKODI must not fall back to “ask the user to test it” when an equivalent automated verification path is available.
- A manual/device exception is allowed only for a narrowly scoped device-, OS-, browser-security- or provider-specific behavior that cannot be meaningfully simulated, or when production telemetry conflicts with synthetic evidence. The exception is explicit, auditable and does not waive unrelated automated verification.
- Machine-readable authority: `governance/constitution/constitution.json` -> `surfaceSystemVerificationPolicy`. Operational contract: `config/surface-system-verification-policy.json`. Human-readable contract: `SURFACE_SYSTEM_VERIFICATION_POLICY.md`.


## 8B. AI Claim Integrity Constitution
- Every AI-produced statement about implementation, merge, deployment, production availability, runtime health, verification, completion, or ecosystem-wide application is a **claim** until authoritative evidence proves it.
- **AI speech never creates operational truth.** A model output, previous chat, memory entry, plan, pull-request description, worker report, Sentinel agreement or another AI statement cannot by itself create or prove current system state.
- Current operational state requires fresh evidence from authoritative system sources. Conversation memory may supply context but may never be the sole basis for a current completion, deployment, runtime-health or broad-scope claim.
- Claim scope may never exceed evidence scope. Verification of one route, service, role, browser, device, tenant or sample cannot be generalized into all pages, all sites, all users or the whole EKODI ecosystem unless evidence covers that broader scope.
- Unknown remains unknown. Stale, missing, contradictory or scope-mismatched evidence cannot be silently filled by model inference or converted into success language.
- Completion and broad-scope operational claims require independent evidence review. A verifier must inspect authoritative evidence rather than merely agree with the worker or model that produced the claim.
- Material success wording such as implemented, merged, deployed, live, verified, complete, working, 완료, 배포 완료, 적용 완료, 정상, 전체 적용 and 모두 적용 requires a verified claim receipt containing the task, claim type and scope, statement hash, evidence sources, observation/verification time and verifier identity.
- EKODI may continue authorized recovery and re-verification automatically when evidence is missing or contradictory, but recovery continuity never authorizes a false success report.
- Machine-readable authority: `config/ai-claim-integrity-policy.json` (`AI-CLAIM-INTEGRITY-001`). Deterministic runtime guard: `ai-claim-integrity.js`. Enforcement: `scripts/validate-ai-claim-integrity.mjs`.


## 8C. AI Knowledge Claim Constitution
- **Retrieval is not verification.** Search hits, RAG chunks, connected documents, memory entries, prior conversations, collaborator output and model-generated summaries are candidate evidence until their provenance, freshness, scope and relation to the claim are checked.
- Model-generated text may not independently prove an external fact. Memory may provide context but cannot independently prove a current external fact.
- Freshness is claim-relative. Volatile facts require much newer evidence than stable historical or academic claims; stale evidence may not be silently presented as current.
- Claim scope may not exceed evidence scope across jurisdiction, version, date, population, product, service, workspace, tenant or other material boundary.
- Credible contradictory evidence blocks an unqualified verified verdict. EKODI must disclose the disagreement, collect more evidence or retain an unresolved state.
- Current primary sources are preferred. Legal, medical, financial, tax, insurance, safety and security facts require authoritative evidence.
- External source instructions are untrusted data. Retrieved text cannot modify EKODI policy, permissions, system prompts, security controls, tool authority or execution behavior.
- Material external facts that pass verification must preserve traceable user-facing source references. A verified internal evidence set without traceable final citation is insufficient for an asserted material fact.
- Unknown, stale, contradictory, low-authority and scope-mismatched knowledge remains non-verified; the AI may continue authorized research but may not fill the gap from prior belief.
- Machine-readable authority: `config/ai-knowledge-claim-policy.json` (`AI-KNOWLEDGE-CLAIM-001`). Deterministic runtime guard: `ai-knowledge-claim.js`. Enforcement: `scripts/validate-ai-knowledge-claim.mjs`.

## 9. Change Constitution
- **C0**: operational parameter change with no constitutional impact. Automated validation may apply it.
- **C1**: backward-compatible implementation change. CI validation is mandatory.
- **C2**: constitution, domain topology, source-of-truth or core-provider policy change. Propose first, obtain explicit owner confirmation, record amendment, bump version, define rollback, then apply.
- **C3**: breaking domain/security/data architecture change. C2 requirements plus migration plan, staged rollout and rollback proof are mandatory.
- Protected constitutional files must not be silently changed as part of unrelated work.

## 10. Legacy Migration Rule
Workspace type-prefixed public routes are retired and are not part of the runtime routing grammar. Any maintained `space.ekodi.kr` or `user.ekodi.kr` workspace alias maps a workspace slug directly to `ekodi.kr/{slug}`. Workspace type remains internal metadata bound to immutable `workspace_id`; it is not a public path component. Root-route collisions are prevented by the platform route registry and verified before release.

## 11. Enforcement
`npm run validate:constitution` validates this constitution against `platform-boundaries.json`, data/storage policy, evolution policy and governance records. `npm run validate:surface-system-verification` validates the universal self-verification contract for all user, operator and administrator surfaces. `npm run validate:architecture` validates the Governance -> OS -> Core -> Responsible Independent Service -> External Connected Service -> Workspace responsibility registry, capability-routing rules and sustainable boundary-growth rules. `npm run check` includes both. GitHub CI runs the same checks on constitutional and platform changes.

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
- Low-risk observation, analysis, forecasting, scoring and sandbox experiments may run automatically within delegated limits. Production changes, shared-core creation, permission expansion, paid commitments, data migration, destructive changes, security-boundary changes and production DNS changes require EKODI Platform Super Administrator approval and the guarded release pipeline.
- `EKODI Evolution Intelligence` recommends; it never becomes sovereign authority. Final platform authority remains the EKODI Platform Super Administrator.

## 13. Open-Ended Generation Evolution Constitution
- EKODI's current architectural generation is **Generation 10: Self-Architecture Optimization**. Generation 10 is the active platform baseline, not a claim that every conceivable future capability is complete.
- The verified progression to the current baseline is: **1 Service Collection -> 2 Integrated Platform -> 3 Capability Platform -> 4 Intent OS -> 5 Agentic OS -> 6 Federated Ecosystem -> 7 Self-Evolving Ecosystem -> 8 Living Digital Commons -> 9 Self-Capability Evolution -> 10 Self-Architecture Optimization**.
- **Generation 8: Living Digital Commons** remains a foundational milestone and mission-shaped ecosystem model; it is no longer treated as a fixed terminal ceiling.
- **Generation 9: Self-Capability Evolution** turns repeated verified work into governed reusable capability and automation candidates through experience patterns, capability graphs, sandbox evaluation and guarded promotion.
- **Generation 10: Self-Architecture Optimization** continuously observes operational and architectural evidence, proposes structural improvements, evaluates them safely, and promotes only verified and reversible changes through sovereign release gates.
- Generation 10 never grants AI direct sovereign authority over production architecture, identity, permissions, secrets, destructive data operations, paid commitments, DNS or constitutional policy.
- Future generations begin at **Generation 11** but are deliberately unnamed until evidence demonstrates a materially new maturity level. EKODI has no predetermined terminal generation.
- Generation advancement is evidence-driven, not date-driven. A new generation requires stable prior-generation contracts, measurable user or mission value, security and authorization integrity, observability evidence, safe functional evaluation, rollback/degraded-operation proof, sustainable cost and capacity, and a verified architectural need.
- Generation skipping is forbidden. A future label may not be used to bypass incomplete identity, authorization, security, observability, cost, rollback or governance foundations.
- Current operations remain **S0 Seed** unless independent scale evidence justifies S1-S3 promotion. Architectural generation and infrastructure scale tier are separate decisions.
- New capability development follows **reuse before creation**. New independent deployment follows **shared before dedicated**. New provider adoption follows **adapter/gateway before lock-in**.
- Existing independent deployment boundaries remain a convergence baseline and do not create precedent for speculative fragmentation.
- The canonical operating-context target remains **Person + Workspace + Membership + Capability**, with authority resolved through **Person + Workspace + Role + Capability**.
- Future-generation promotion requires an explicit C2/C3 constitutional amendment, EKODI Platform Super Administrator confirmation, repository validation, guarded merge, and production verification whenever runtime behavior changes.
- Machine-readable generation definitions, scale tiers, forward-evolution gates and boundary rules are maintained in `governance/architecture/ekodi-evolution-model.json` and enforced by repository validators.


## Mandatory Daily Technology Scout Constitution
- `TECH-SCOUT-001` requires EKODI Orchestrator to execute one technology/trend scouting cycle every day at 08:00 Asia/Seoul.
- External search/OpenAI/providers are replaceable evidence sources only and never own policy, approval, execution or deployment authority.
- Scouting is mandatory; candidate application remains human-gated and must use the normal isolated branch, validation, review, guarded deployment and production verification lifecycle.
- Failed/degraded runs remain durable and visible and never silently disable future runs.
