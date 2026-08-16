# EKODI AI Capability Library

## Product definition

EKODI is a **Personalized AI Ecosystem Platform**.

The user should not have to learn a growing map of specialist AI products before doing useful work. The default experience is person- or organization-centered:

`identity → My EKODI → intent → workspace blueprint → specialist capabilities → action/review → history`

Specialist AI sites remain valuable, but their primary public role is **showroom + entry point**. After identity is known, the normal working surface should converge on My EKODI or a composed workspace unless a dedicated public site, brand, team boundary, regulatory boundary, or operational boundary is justified.

## Architecture

### 1. Shared core

Keep identity, workspace ownership, tenant isolation, billing, permissions, audit, mission governance, and safe agent execution in shared contracts.

### 2. Capability Library

`config/ai-capabilities.json` is the machine-readable catalog of reusable professional abilities. A capability is not a whole website. It declares:

- stable capability id
- human-readable purpose
- governance owner agent
- maximum default action tier
- maturity
- supported surfaces
- optional verified showroom service

Capabilities should be small enough to recombine across people and organizations, but large enough to own a coherent professional responsibility.

### 3. Workspace Packs

`config/workspace-packs.json` groups capabilities into reusable starting configurations. Packs are defaults, not cages. A person can combine more than one pack and add or remove capabilities as needs change.

Initial packs:

- `personal-starter`: My EKODI default
- `creator`: writing, visual, media, publishing, rights, marketing and public presence
- `small-business`: marketing, CRM, sales, operations, commerce, finance and analytics
- `organization`: membership, events, documents, communication, finance and automation
- `learning-research`: research, learning, writing, documents and analytics
- `work-career`: career discovery, learning, research and work artifacts
- `ministry-community`: ministry, community, communication and creator media
- `trade-commerce`: trade, sales, operations, commerce, finance and documents
- `insurance-care`: insurance understanding, documents, analytics and finance context
- `energy-care`: energy observation, analytics and improvement projects

### 4. Orchestrator

`ai-capability-orchestrator.js` produces a **workspace blueprint**. The first implementation is deliberately deterministic and inspectable. It matches simple user intent signals to packs, resolves capabilities, exposes human-gated capabilities, and lists relevant showroom services.

It does not execute privileged actions, create domains, merge identities, publish content, enter contracts, buy insurance, or commit funds. Those remain under the existing mission-governance and action-gateway contracts.

A later LLM-based navigator may improve intent understanding, but it must return to this explicit catalog rather than inventing unregistered powers.

## Essential capability layers

### Common capabilities

Every domain can reuse navigation, project coaching, documents, workflow automation, communication, analytics, and on-demand public-site composition.

### Specialist capabilities

The first catalog includes knowledge/research, learning, work/career, creator, marketing/CRM/sales/business operations, commerce/finance, community/events, ministry, trade, insurance, and energy.

This is intentionally a capability library rather than a domain-per-site list. New demand should normally add or improve a capability first. Create a new public product only when discoverability, branding, compliance, data isolation, or operational ownership needs a distinct service boundary.

## Showroom policy

A specialist site may:

1. explain a professional problem clearly;
2. demonstrate the relevant EKODI capabilities;
3. offer a focused trial or onboarding path;
4. authenticate through the central identity contract;
5. hand the user into My EKODI or the appropriate workspace.

A specialist site should not duplicate identity, user ownership, billing truth, or private workspace data merely to look independent.

Current service-backed showroom mappings include Creator AI (`author` compatibility boundary), Marketing AI, Business OS, Community, Mall, Work, Books, and Energy where the capability catalog references them. A future hostname change such as `create.ekodi.kr` must follow the guarded staging, DNS, auth, CORS, registry, rollback and production-verification process. The capability architecture does not require that rename in order to work.

## Dedicated-site rule

A dedicated site is **on demand, not the default**.

Recommend it only when at least one durable need exists:

- public brand or portfolio identity
- customer-facing service surface
- team or organization boundary
- independent domain requirement
- special compliance or data boundary
- operational ownership that should deploy separately

Otherwise keep the activity in My EKODI and compose capabilities there.

## Monetization fit

The same architecture supports progressive packaging without artificial lock-in:

`Free My EKODI → paid capability usage → Plus/Pro packs → organization workspace → dedicated site → enterprise integration`

Pricing should follow actual value and operating cost. Capability access, usage, automation, team controls, dedicated operations, and managed integrations are separable commercial dimensions. User data portability, revocation, and exit remain mission invariants.

## Adding a capability

Before adding a new site, ask:

1. Is this a new professional ability or merely a new presentation of an existing ability?
2. Which existing governance agent owns its boundary?
3. What is the safest default action tier?
4. Which existing packs can reuse it?
5. Does it truly need a showroom or dedicated service boundary?
6. Can its result remain portable and understandable outside EKODI?

Add the capability to the catalog, add it to at least one pack, run capability validation and repository tests, then verify through staging. Production exposure remains a separate guarded release decision.
