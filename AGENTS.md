# EKODI Platform Engineering Guide

EKODI Platform is a mission-oriented, sustainable Agentic AI operating ecosystem. This file guides AI agents and human developers in applying EKODI governance. It is **not** a second constitution and must not restate historical rules as if they were current authority.

## 0. Authority and precedence

Before making an architectural or cross-cutting change, resolve policy in this order:

1. Mission, human dignity, safety, privacy and agency governance in `config/ai-mission-governance.json`.
2. The machine-readable EKODI Platform Constitution in `governance/constitution/constitution.json`.
3. The operational Constitution Registry index in `governance/registry/constitution-registry.json` for stable IDs, lifecycle state and likely impact paths.
4. Shared platform policies such as `platform-boundaries.json` and `config/**`.
5. Service-owned configuration and contracts.
6. Runtime configuration and implementation details.

If two sources conflict, the higher-precedence active source wins. Secondary prose, old examples, prior conversations and historical implementation notes must never override the currently active canonical source.

The registry index is intentionally non-sovereign. It points to constitutional truth; it does not duplicate or replace it.

## 1. Mission governance is the highest product invariant

EKODI assumes that human administrators exercise limited, delegated stewardship rather than unlimited authority. AI authority is narrower still.

The purpose of EKODI AI is to help people become more independent, responsible, free, connected in truthful community and able to live a Jubilee-oriented life before God. AI is a bounded professional delegate and tool, never the sovereign purpose of the ecosystem.

The governing values remain stewardship, agency, koinonia, diaspora, Jubilee and holiness. Policy priority is mission and human dignity → safety/legal/privacy → consent and user agency → community/Jubilee impact → reliability → efficiency/revenue.

Chief AI / EKODI Orchestrator coordinates work but does not become sovereign authority. High-impact human gates and forbidden boundaries cannot be bypassed by an AI agent.

Do not weaken or bypass mission-governance validation to ship a feature.

## 2. Constitutional change handling

Ordinary UI, copy, content and local implementation changes should remain lightweight. Do not manufacture constitutional work where none exists.

Before changes to domain grammar, workspace identity, authentication/authorization, data sovereignty, provider boundaries, security projection, AI authority, deployment authority or common/core-service boundaries, run or consult the lightweight Constitution Check:

`node scripts/constitution-check.mjs`

The check is advisory and non-blocking. It may report `PASS`, `RELATED`, `UPDATE` or `NEW_AREA`. It intentionally does not decide semantic constitutional conflicts.

Existing hard safeguards remain hard safeguards. Security validation, tenant isolation, protected-branch rules, guarded deployment, mission governance and C2/C3 approval requirements must not be weakened merely to satisfy the advisory check.

## 3. Domain and workspace identity

Do not invent domain or tenant naming rules from memory. Consult `DOMAIN-001`, `WORKSPACE-001` and the corresponding canonical fields in `governance/constitution/constitution.json`.

Current canonical workspace identity is derived from immutable `workspace_id`. Hostnames, slugs and URL paths are routing locators, not authorization truth. Public user-operated spaces follow the canonical workspace routing grammar declared by the constitution. Workspace type remains internal metadata unless a separately approved constitutional rule says otherwise.

Dedicated subdomains are reserved for justified system, security, protocol, common-service or core-service boundaries registered in constitutional governance. Historical customer, feature or AI subdomain examples are legacy or compatibility information unless the current constitution explicitly registers them as active boundaries.

Customer-owned domains may map to a workspace public surface but never redefine EKODI internal identity or authorization.

## 4. Customer classification and authority scope

Ownership by EKODI is not the platform boundary. Operational responsibility and tenant scope are.

An operating organization or business is a customer site/tenant even when EKODI owns it. It must use the same tenant contract, isolation rules, memberships, audit model and role boundaries as an external customer.

One person may hold both platform-global and tenant-local roles. These authorities must never be implicitly combined. A Super Administrator acts with platform authority only inside an explicit platform administration context. When entering a customer site, including an EKODI-owned customer site, the person acts through that site's membership and local role.

A tenant-local role named `admin` must never inherit platform-admin capabilities merely because the role string matches.

## 5. Production invariants

A production change is incomplete until all applicable checks pass.

- No redirect loops.
- No broken canonical domain.
- No customer-domain reassignment without explicit intent.
- No client-side exposure of provider credentials, API secrets, payment secrets, DNS tokens or privileged service keys.
- Admin pages keep restrictive security headers and `Cache-Control: no-store` where applicable.
- Production endpoint verification tests the real public hostname, not only a build artifact or preview URL.
- A successful deploy command alone is not proof of a successful release.
- Routing, DNS, auth, payment, customer-domain or control-plane changes require regression coverage.
- Privileged agent actions pass mission governance before execution.

Shared-edge or topology changes require explicit impact review across every affected route.

## 6. Platform isolation

EKODI sites are independent platforms or specialized services, not cosmetic pages inside one release unit.

- A normal source change deploys only the platform that owns that source.
- Coordinated full-ecosystem deployment remains verification-oriented and separately guarded.
- Shared edge runtimes are shared infrastructure and require regression checks across every domain they serve.
- Shared database changes are shared-core changes and preserve tenant namespaces and migration discipline.
- Platform-specific code must not directly access another platform or tenant's private data. Use an explicit shared API contract.
- Keep `platform-boundaries.json` and relevant isolation documentation accurate when ownership, domain, data store or deployment unit changes.

## 7. Parallel development

Claude Code, ChatGPT/GPT, Codex, Gemini, Copilot, future AI development agents and human developers follow the same provider-neutral development contract.

Every task uses a unique task ID and an independent branch plus independent worktree or equivalent sandbox. Concurrent tasks do not share one mutable working directory. Agents and ordinary development workers do not write directly to protected production branches and do not deploy production directly from an agent task workspace.

Production-bound changes pass central validation, review, merge and guarded deployment. Production credentials remain outside ordinary agent workspaces.

## 8. Definition of done

For business-critical changes, “done” means all applicable items below are true:

1. Source validation passes.
2. Automated tests pass.
3. Mission-governance validation passes for agentic or privileged behavior.
4. Guarded deployment succeeds when deployment is part of the task.
5. Real production hostname returns the expected status and content.
6. Redirect behavior is verified when routing changes.
7. `admin.ekodi.kr` or the appropriate control plane can observe resulting service state.
8. Security, human agency and tenant boundaries remain intact.
9. Failure is visible through monitoring or operational logs.

Never report a production feature as complete merely because code was committed.

## 9. Agentic AI architecture direction

The platform evolves toward an action-oriented mission control loop:

`observe → discern → consult specialists → policy check → act or request human decision → verify → restore user agency → audit → report`

Agent actions are scoped by tenant, role, delegated purpose and mission policy. Destructive, spiritually sensitive, legally binding, rights-reducing, financially sensitive or similarly high-impact actions require the appropriate human decision gate.

Operational AI receives only the minimum projected context required for the task. Secrets, reusable credentials and unnecessary internal topology remain outside ordinary AI context.

AI providers are replaceable reasoning or execution resources behind EKODI Core. They do not own EKODI identity, authorization, payment truth or irreversible high-impact decisions.

## 10. AI access, funding and provider independence

Use EKODI Core first for deterministic rules, verified system data and non-AI workflows. Do not call a model merely because one is available.

Google sign-in establishes EKODI identity. It does not transfer a consumer ChatGPT, Gemini or other AI subscription to EKODI. Consumer AI web sessions are not server APIs and must not be used for unattended execution.

User-owned provider credentials remain server-side in a protected credential vault with revocation, masking, isolation and auditability. Sensitive data must not be automatically sent to personal/free AI routes.

Lack of a personal AI connection, sponsored allowance, provider availability or API credential must not collapse EKODI Core. Preserve safe degraded or Core-only behavior.

## 11. Multi-tenant direction

The canonical activity model is:

`Person + Site/Tenant + Membership Role + Authority Scope`

Each tenant may independently own branding, domain mapping, enabled products, integrations, content/approval workflow, analytics, billing, users/roles, audit history, delegated AI permissions and appropriate data export/exit controls.

Shared infrastructure is encouraged. Shared customer data or implicit cross-tenant authority is not.

## 12. Sustainable monetization

Design reusable capabilities so they can map cleanly to sustainable commercial packaging. Avoid one-off customer code when a configurable product capability solves the same problem.

Revenue is necessary for sustainability but never overrides mission boundaries, truthful consent, privacy, human agency or tenant isolation. Do not use dark patterns, artificial lock-in, hidden conflicts of interest or deliberate dependency creation.

## 13. Release discipline

Prefer small reversible releases over large opaque changes.

Before changing production routing, authentication or privileged AI behavior:

- inspect current implementation and live configuration
- identify rollback behavior
- check mission-governance and constitutional impact
- add or update regression tests
- deploy through the guarded path
- verify the real domain and resulting user impact

When an incident occurs, find and fix the root cause. Do not push browser workarounds onto users unless evidence shows the browser is actually the cause.

## 14. Current automated safeguards

The repository contains business contract tests, production/revenue gates, platform-boundary validation, security validation, deployment guardrails and AI mission-governance validation. Do not weaken or bypass them to make a deployment green. Fix the underlying defect.

The lightweight Constitution Check is different by design: it surfaces likely constitutional relevance without becoming a new deployment bottleneck.

## 15. Quality bar

Optimize for an ecosystem people and paying customers can trust. Visual polish matters, but mission fidelity, human dignity and agency, correctness, clarity, speed, security, observability, maintainability, sustainable economics and measurable beneficiary outcomes come first.

## 16. Verified service truth before current-state assertions

For any claim about the **current** existence, canonical URL, admin URL, domain or route, deployment state, operational state, public exposure, authentication route or service boundary of EKODI, use the provider-neutral policy in `config/service-truth-policy.json`.

Do not infer current EKODI facts from model memory, prior conversation, naming conventions, repository names or example URLs. Repository evidence proves implementation only. A deploy record proves a deployment event only. Neither alone proves that the canonical service is currently operational.

When available, resolve the declared topology from `platform-boundaries.json` and constitutional governance, then consult fresh runtime evidence from the Control API service snapshot or equivalent verified health evidence. If fresh runtime evidence cannot be obtained, distinguish what is declared or implemented from what is currently verified and label the runtime state `unverified` rather than guessing.

This rule applies equally to ChatGPT/GPT, Codex, Claude, Gemini, Copilot, future AI providers and human operators. AI providers consume EKODI truth; they do not define it.
