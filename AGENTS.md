# EKODI Platform Engineering Constitution

EKODI Platform is not a demo site collection. It is a mission-oriented, sustainable Agentic AI operating ecosystem intended to serve people and recurring services. Every change must protect the mission, human dignity and agency, trust, availability, tenant isolation, data integrity, and sustainable operation.

## 0. Mission governance is the highest product invariant

EKODI assumes that human administrators exercise limited, delegated stewardship rather than unlimited authority. AI authority is always narrower still.

The purpose of EKODI AI is to help each person become more independent, responsible, free, holy, connected in truthful community, and able to live a Jubilee-oriented life before God. AI is a bounded professional delegate and tool, never the sovereign purpose of the ecosystem.

The governing principles are:
- **Stewardship**: use only delegated authority and escalate beyond its limits.
- **Agency**: preserve informed choice, revocation, portability, exit, and meaningful human review.
- **Koinonia**: strengthen truthful human relationship and mutual service rather than replacing community for convenience.
- **Diaspora**: equip people to act faithfully and competently beyond EKODI rather than creating platform captivity.
- **Jubilee**: reduce exploitative dependency and information asymmetry, restore opportunity, and protect the vulnerable.
- **Holiness**: reject deceptive, coercive, exploitative, or intentionally degrading means even when they improve a metric.

Policy priority is mission and human dignity → safety/legal/privacy → consent and user agency → community/Jubilee impact → reliability → efficiency/revenue. Revenue is necessary for sustainability but never overrides mission boundaries, truthful consent, privacy, or human agency.

Chief AI is an orchestrator, not a sovereign. Unknown agents receive no implicit autonomous authority. High-impact human gates and forbidden boundaries cannot be overridden by Chief AI.

The machine-readable source of truth is `config/ai-mission-governance.json`. The executable evaluator is `ai-governance.js`. Design and review guidance is in `docs/AI-MISSION-GOVERNANCE.md`. Do not weaken or bypass mission-governance validation to ship a feature.

## 1. Product identity

- `ekodi.kr`: EKODI front door.
- `admin.ekodi.kr`: private control plane and operational command center.
- `api.ekodi.kr`: shared control/data API layer.
- `marketing.ekodi.kr`: Marketing AI platform hub and Free/Basic tenant entry namespace.
- `ai.ekodi.kr`: reserved namespace for dedicated Marketing AI customer workspaces.
- Marketing AI Free/Basic tenant entry uses `marketing.ekodi.kr/<tenant>`.
- Marketing AI Plus-or-higher dedicated EKODI workspace uses `<tenant>.ai.ekodi.kr`.
- Marketing AI Pro-or-higher may additionally map a customer-owned hostname without transferring domain ownership to EKODI.
- Existing first-level customer domains may remain official public-site domains or compatibility aliases. Do not treat them as the canonical Marketing AI naming standard unless explicitly configured for another product.
- Service-specific details belong in URL paths or product configuration unless a product has an explicit namespace contract such as `ai.ekodi.kr`.

## 2. Customer classification and authority scope are business invariants

Ownership by EKODI is not the platform boundary. The boundary is operational responsibility.

Platform-internal surfaces are limited to EKODI Core and reusable shared/professional capabilities such as central identity, authorization, billing, AI governance, security, logs, shared APIs, and control-plane infrastructure.

An operating organization or business is a customer site/tenant even when EKODI owns it. It must use the same tenant contract, isolation rules, memberships, audit model, and role boundaries as an external customer.

EKODI-owned customer-site examples include:
- `church.ekodi.kr` — 에코디교회
- `biz.ekodi.kr` — 에코디비즈
- `lab.ekodi.kr` — 에코디연구소
- `trade.ekodi.kr` — EKODI Global Trading
- `cafe.ekodi.kr` — 에코디 카페 when operated as an organization/business

Revenue-critical external clients currently include:
- `ekodi.kr/cgma` — 청계면상인회 canonical public workspace; marketing is `ekodi.kr/cgma/marketing`. Legacy `cgma*.ekodi.kr` hosts are compatibility aliases only.
- `ekodi.kr/jadam` — 자담치킨 목포대점 canonical workspace; marketing is `ekodi.kr/jadam/marketing`. Legacy Jadam subdomains are compatibility aliases only.
- `ekodi.kr/pizzamaru` — 피자마루 목포대점 canonical workspace; marketing is `ekodi.kr/pizzamaru/marketing`. Legacy Pizzamaru subdomains are compatibility aliases only.
- `ekodi.kr/yogurt` — 요거트퍼플 목포대점 canonical workspace; marketing is `ekodi.kr/yogurt/marketing`. Legacy Yogurt subdomains are compatibility aliases only.

One person may hold both platform-global and tenant-local roles. These authorities must never be implicitly combined. A Super Admin acts with platform authority only inside an explicit admin/control-plane context; when entering a customer site, including an EKODI-owned customer site, the person acts only through that site's membership and local activity role. A tenant-local role named `admin` must never inherit platform-admin capabilities merely because the role string matches.

`My EKODI` should present the person's available sites/workspaces and local roles, while `admin.ekodi.kr` remains the explicit ecosystem-wide administrator context.

Do not silently reclassify customer tenants or weaken this authority boundary.

## 3. Production invariants

A production change is incomplete until all applicable checks pass.

- No redirect loops.
- No broken canonical domain.
- No customer domain reassignment without explicit intent.
- No client-side exposure of provider credentials, API secrets, payment secrets, DNS tokens, or privileged service keys.
- Admin pages must keep restrictive security headers and `Cache-Control: no-store`.
- Revenue-critical customer domains must remain monitored.
- Production endpoint verification must test the real public hostname, not only a build artifact or Pages preview URL.
- A successful deploy command alone is not proof of a successful release.
- Any routing, DNS, auth, payment, customer-domain, or control-plane change requires regression coverage.
- Any privileged agent action must pass mission governance before execution.

## 3A. Platform isolation is a production invariant

EKODI sites are independent platforms or specialized services, not cosmetic pages inside one release unit.

- A normal source change must deploy only the platform that owns that source.
- The coordinated full-ecosystem deployment workflow is manual-only.
- Every platform-specific deployment workflow must use explicit path filters.
- Shared edge runtimes must be treated as shared infrastructure and require regression checks across every domain they serve.
- Do not add a platform-specific source file to a shared runtime when an isolated Worker, Pages project, module, or API contract can solve the problem.
- Shared database changes are shared-core changes. Name migrations by functional area and preserve table/tenant namespaces.
- Platform-specific code must not directly access another platform or tenant's private data. Use an explicit shared API contract.
- Changes to `site-worker.js`, `service-proxy.js`, shared auth, shared payment, or shared database infrastructure require an explicit impact review before deployment.
- Keep `platform-boundaries.json` and `docs/PLATFORM-ISOLATION.md` accurate when a platform's ownership, domain, data store, or deployment unit changes.

## 4. Definition of done

For business-critical changes, “done” means:

1. Source validation passes.
2. Automated tests pass.
3. Mission-governance validation passes for agentic or privileged behavior.
4. Deployment succeeds.
5. Real production hostname returns the expected status and content.
6. Redirect behavior is explicitly verified when routing changes.
7. `admin.ekodi.kr` can observe the resulting service state.
8. Security, human agency, and tenant boundaries remain intact.
9. Failure is visible through monitoring or operational logs.

Never report a feature as complete merely because code was committed.

## 5. Agentic AI architecture direction

The platform should evolve from a link dashboard into an action-oriented mission control plane:

`observe → discern → consult specialists → policy check → act or request human decision → verify → restore user agency → audit → report`

Examples:
- detect a customer-site outage
- identify DNS/deployment/application cause
- prepare the safest repair action
- require a human decision for destructive, spiritually sensitive, legally binding, rights-reducing, or financially sensitive actions
- execute reversible work through server-side privileged integrations within delegated scope
- verify the production result
- restore clear user choices and portability where relevant
- record an immutable audit event

Agent actions must be scoped by tenant, role, delegated purpose, and mission policy. High-impact actions must never be hidden behind vague automation. A specialist AI may escalate or object when its domain boundary is crossed, and Chief AI must surface rather than suppress that dissent.

## 5A. AI access, funding, and execution are ecosystem operating invariants

EKODI must hide unnecessary AI-provider complexity from users and administrators while keeping funding, privacy, execution authority, and provider boundaries explicit inside EKODI Core.

The default experience is not “choose OpenAI, Gemini, API, or web.” A person should normally sign in, use EKODI, and receive prepared help without needing to understand the underlying AI route. Provider and billing choices belong behind EKODI Core and the AI Gateway unless the person deliberately opens advanced AI settings.

The governing access principles are:

- **Core first**: rules, verified system data, deterministic workflows, and non-AI services must handle a task whenever they can. Do not call a model merely because an AI provider is available.
- **Provider independence**: OpenAI, Gemini, or any other provider is a replaceable reasoning/execution resource behind EKODI Core, not the identity or source of truth of the ecosystem.
- **Identity is separate from AI entitlement**: Google sign-in establishes EKODI identity. It does not automatically transfer a user's ChatGPT, Gemini, or other consumer AI subscription, quota, or billing rights to EKODI.
- **Personal AI access and API execution are different channels**: consumer ChatGPT/Gemini web access may be offered for a person's own interactive use, but it must never be treated as a server API, borrowed session, or unattended automation credential.
- **Free/Flex cost invariant**: by default, Free and Flex members must not silently consume EKODI-paid model API usage. Their normal order is `Core → connected personal server-callable API → personal AI web handoff → Core-only`.
- **Paid seamless-use invariant**: when a paid membership includes EKODI AI support, the automatic interactive order is `Core → connected personal API → membership-sponsored EKODI API → personal AI web handoff → Core-only`. This minimizes disruptive page switching while keeping the EKODI-funded allowance bounded by membership policy.
- **Explicit personal-first preference**: when a person explicitly chooses personal-first mode, EKODI should prefer personal API and personal AI access before consuming a sponsored EKODI allowance, subject to privacy and execution rules.
- **Proactive/unattended execution invariant**: when EKODI acts before a person asks, prepares background recommendations, or performs scheduled/conditional AI work, it may use only server-callable, auditable API paths. Consumer ChatGPT/Gemini web sessions must never be used for unattended execution.
- **Admin/system execution invariant**: EKODI Admin AI and system automation must use EKODI Core, governed server integrations, and auditable APIs. They must not borrow an administrator's consumer AI browser session or subscription as an automation engine.
- **Sensitive-data invariant**: secrets, credentials, tokens, payment data, government identifiers, protected personal data, or equivalent sensitive information must not be automatically sent to personal/free AI routes or consumer web handoffs. Route only through an explicitly permitted protected path, or remain Core-only.
- **Credential invariant**: user-owned provider credentials must never be stored in browser localStorage, client bundles, analytics, or logs. They require a server-side encrypted credential vault, revocation, masking, tenant/user isolation, and auditability.
- **Funding traceability**: AI usage must distinguish at least `personal`, `ekodi-sponsored`, and `none/core-only` funding so EKODI never mixes user-owned usage with ecosystem-paid usage.
- **Membership packaging**: commercial plans should sell an `EKODI AI support allowance` or capability, not a hard dependency on a named provider or fixed provider-specific call count. The Gateway may change models/providers while preserving the member benefit and cost ceiling.
- **Graceful degradation**: lack of a personal AI connection, sponsored allowance, provider availability, or API credential must never stop EKODI Core. The system must fall back safely to personal handoff or Core-only behavior.
- **Low-friction UI**: normal UI should show concise states such as “내 AI 연결됨”, “EKODI 지원 AI”, “무료 이용”, or “AI 없이 계속”. API keys, model names, token accounting, and provider routing belong in advanced settings or admin observability, not in the ordinary user path.
- **Proactive service, not proactive noise**: User AI and Admin AI should observe state, prepare useful outputs, and surface only high-value next actions. Users and administrators should not be forced to ask first, but AI must also avoid unnecessary interruption and preserve final human control for high-impact decisions.

The shared routing policy should follow the intent-specific pattern:

- Interactive Free/Flex: `Core → personal API → personal AI access → Core-only`
- Interactive paid automatic mode: `Core → personal API → EKODI-sponsored API → personal AI access → Core-only`
- Interactive explicit personal-first: `Core → personal API → personal AI access → EKODI-sponsored API when allowed → Core-only`
- Proactive/unattended: `Core → personal server API when explicitly connected and permitted → EKODI-sponsored API when entitled → Core-only`
- Admin/system: `Core → governed server API/integration → Core-only`

Any implementation that bypasses these invariants, silently shifts AI cost to EKODI or the user, reuses a consumer browser session for automation, exposes provider credentials, or makes Core availability depend on one AI provider is a governance regression and must not ship.

## 6. Multi-tenant direction

All customer sites are independent tenants, not cosmetic page variants. This includes both external customers and EKODI-owned operating organizations.

The canonical activity model is `Person + Site/Tenant + Membership Role + Authority Scope`. A person may belong to many tenants and hold different local roles in each. The currently active site context determines the available tenant capabilities; platform-global administrator authority is a separate context and is never inherited by a tenant session.

Each tenant should be able to own independent configuration for:
- identity and branding
- domain
- enabled products
- channels and integrations
- content and approval workflow
- analytics
- billing/subscription
- users and roles
- local activity-role labels such as pastor, representative, director, manager, or staff
- audit history
- delegated AI permissions and revocation state
- data access/export and exit controls where applicable

Shared infrastructure is encouraged, shared customer data or implicit cross-tenant authority is not.

## 7. Monetization direction

Design new capabilities so they can map cleanly to commercial packaging, for example:
- Marketing AI
- content generation and approval
- channel publishing
- analytics/reporting
- CRM/customer engagement
- live/media operations
- managed domain/hosting
- premium automation/agent actions

Avoid one-off customer code when a configurable product capability can solve the same problem. Do not use dark patterns, artificial lock-in, hidden conflicts of interest, or deliberate dependency creation to improve monetization.

## 8. Release discipline

Prefer small reversible releases over large opaque changes.

Before changing production routing, authentication, or privileged AI behavior:
- inspect the current implementation and live configuration
- identify rollback behavior
- check mission-governance impact and human-gate requirements
- add or update regression tests
- deploy through the guarded path
- verify the real domain and resulting user impact

When an incident occurs, find and fix the root cause. Do not instruct users to clear cookies or perform local workarounds unless evidence shows the browser is actually the cause.

## 9. Current automated safeguards

The repository contains business contract tests, a Production Revenue Gate, platform-boundary validation, and AI mission-governance validation. Do not weaken or bypass them to make a deployment green. Fix the underlying defect.

## 10. Quality bar

Optimize for an ecosystem people and paying customers can trust. Visual polish matters, but mission fidelity, human dignity and agency, correctness, clarity, speed, security, observability, maintainability, sustainable economics, and measurable beneficiary outcomes come first.
