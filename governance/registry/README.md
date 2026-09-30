# EKODI Constitution Registry

This directory is an operational index for the EKODI Platform Constitution. It exists to reduce policy drift across AI agents, developers, services and deployment tooling without creating a second constitution.

## Single source of truth

The machine-readable constitutional authority remains:

`governance/constitution/constitution.json`

`constitution-registry.json` is an index only. It gives stable IDs, lifecycle state, precedence and likely impact paths so tools can find the relevant constitutional area quickly. If this index and the canonical constitution ever disagree, the canonical constitution wins and the index must be repaired.

## Precedence

Use the precedence declared in `constitution-registry.json`. Lower-level implementation guidance must not override higher-level constitutional or mission governance.

Secondary prose such as agent instructions, service notes, historical discussions and old examples are guidance only when they agree with the currently active canonical sources. Historical rules should be marked superseded rather than silently treated as current.

## Lightweight Constitution Check

`scripts/constitution-check.mjs` is deliberately advisory.

It answers a small question: does the current change appear related to an active constitutional area?

Possible results:

- `PASS`: no indexed constitutional impact was detected.
- `RELATED`: the change touches one or more active indexed principles.
- `UPDATE`: the registry or canonical constitution itself changed.
- `NEW_AREA`: an architectural change was detected but no existing registry entry clearly covers it.

The check does not attempt semantic legal-style reasoning and does not decide whether a change is constitutionally valid. It never grants approval. It never replaces security validation, release guardrails, tenant isolation, mission governance or C2/C3 approval gates.

## Lifecycle

Registry entries use only three states for now:

- `draft`
- `active`
- `superseded`

This is intentionally small. Add more lifecycle machinery only if repeated operational evidence shows it is needed.

## Operating rule

For ordinary UI, copy, content and local implementation changes, do not create constitutional work unnecessarily. For domain grammar, workspace identity, authentication/authorization, data sovereignty, provider boundaries, security projection, AI authority, deployment authority or common-service boundaries, consult the registry first and surface related active principles for review.

The EKODI Platform Super Administrator remains the final authority for constitutional amendments and exceptions within the platform governance model.
