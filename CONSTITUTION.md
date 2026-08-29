# EKODI Platform Constitution v1.1.0

Effective: 2026-08-29

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
- Canonical public user-space namespaces are `ekodi.kr/personal/{slug}`, `ekodi.kr/org/{slug}`, `ekodi.kr/group/{slug}` and `ekodi.kr/project/{slug}`.
- Business, church, school, nonprofit, association, institution and similar formal entities are organization subtypes under `/org/{slug}` unless a future constitutional amendment defines another universal workspace kind.
- `space.ekodi.kr`, `user.ekodi.kr` and per-tenant subdomains are not canonical workspace addresses. If such aliases exist, they must redirect to the corresponding `ekodi.kr` path while preserving the remaining path where practical.
- `my.ekodi.kr` remains the personal authenticated home/control surface and may present workspace participation, switching and private controls without becoming the canonical public workspace address.
- Public and private routing resolve tenant/workspace authorization from immutable `workspace_id`; URL host, path and slug are routing locators, not identity or authorization truth.
- Common services and core services may keep or receive dedicated subdomains only when security, operational isolation, protocol separation or independently managed service boundaries justify them and the domain is registered in constitutional governance.
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
- Use free tiers first, but never make a free quota the architectural ceiling.
- Google Workspace is a collaboration provider; Cloudflare is edge/system-object infrastructure; AI vendors are replaceable compute providers.
- Use gateways where provider churn or critical dependency justifies them: identity, AI, storage and communications.
- Use lightweight adapters for lower-risk integrations rather than universal abstraction.
- A provider outage must degrade only its dependent capability where practical.

## 6. Security and Traffic Constitution
- Internet traffic reaches EKODI through the edge security boundary before origin services.
- Public origin, database, Redis, SSH/RDP and privileged administration endpoints are forbidden.
- Admin uses a stronger access boundary than ordinary user surfaces.
- Public content is cache-first; private/admin responses are restricted or no-cache.
- Edge controls absorb volumetric abuse; EKODI enforces user, tenant, capability and cost-aware limits.
- Login, signup, upload, AI and other abuse-sensitive endpoints receive dedicated throttling and verification.

## 7. AI Constitution
- AI calls route through provider-independent governance when a gateway exists.
- AI never owns EKODI identity, authorization, payment or irreversible high-impact decisions.
- Expensive AI work has quota, timeout, retry, circuit-breaker and fallback behavior.
- Provider unavailability must retain a safe degraded or non-AI path where the service permits it.

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
Existing feature and workspace aliases are not deleted merely to satisfy the canonical grammar. They migrate through canonical paths plus redirects/compatibility routes. In particular, legacy `/people/{slug}` maps to `/personal/{slug}` and legacy `/biz/{slug}` tenant/workspace paths map to `/org/{slug}`. Any deployed `space.ekodi.kr` or `user.ekodi.kr` workspace alias must redirect to the equivalent `ekodi.kr` path. Migration proceeds without breaking existing users, OAuth callbacks or external links, and redirect rules must be verified before an alias is retired.

## 11. Enforcement
`npm run validate:constitution` validates this constitution against `platform-boundaries.json`, data/storage policy and governance records. `npm run check` includes it. GitHub CI runs the same check on constitutional and platform changes.

Machine-readable authority: `governance/constitution/constitution.json`.
