# EKODI Capability & Intent Core

## Purpose

EKODI moves from a service-first catalog toward a capability-first operating model without adding speculative infrastructure.

The user expresses intent. EKODI resolves that intent into registered capabilities, then existing services or providers implement those capabilities behind explicit contracts.

`Person / Workspace -> Intent -> Capability -> Policy -> Service or Provider -> Verify`

This is the Generation 3 foundation and the low-cost entry point to Generation 4 Intent OS.

## Machine-readable contracts

- `config/capability-registry.json`: canonical reusable capability catalog
- `config/workspace-packs.json`: reusable starting compositions
- `governance/architecture/capability-provider-contract.v1.json`: provider-neutral implementation envelope
- `capability-intent-runtime.js`: deterministic-first intent router and plan builder
- `scripts/validate-capability-registry.mjs`: CI contract validator

## Cost posture

The default router is deterministic and requires no model call. A future model may help classify ambiguous intent, but it may only select from the registered capability catalog.

No new database, Worker, subdomain, queue, or dedicated deployment is required by this core.

## Safety posture

Every capability declares its maximum default action tier. Intent routing never grants authority.

- `observe`: automatic read-only observation
- `assist`: automatic analysis and preparation
- `execute_reversible`: candidate for Sovereign Autonomous Operations preflight
- `human_gate`: user or authorized human decision required
- `forbidden`: blocked

Execution authority continues to come from `Person + Workspace + Role + Capability` and the v1.8.1 Sovereign Autonomous Operations policy.

Unknown requested capabilities remain unresolved. They are never guessed, synthesized, or silently mapped to broader powers.

## Workspace Packs

Packs are starting compositions, not identity or authorization boundaries. The initial set covers personal, creator, small business, organization, learning/research, work/career, ministry/community, trade/commerce, insurance, and energy contexts.

A workspace may combine or change packs while its immutable `workspace_id` remains the authority anchor.

## Service boundary rule

A capability does not imply a new service. Reuse order is:

`existing capability -> shared runtime -> existing service/provider implementation -> independent boundary only with evidence`

## Next integration

The first consumer should be My EKODI. Its user-facing entry can ask what the user wants to do, call this deterministic router, and show the resulting capability plan before any privileged execution.

Execution then passes through the existing Control Plane and v1.8.1 autonomy gates. Human-gated capabilities remain sovereign decisions while bounded reversible work may proceed through preflight, verification, audit, and recovery.

This keeps physical infrastructure at S0 while advancing architecture toward Generation 3 and user experience toward Generation 4.
