# EKODI OS Architecture

Effective: 2026-09-04

Canonical principle:

> **Integrated responsibility, distributed execution, standardized connections.**
> **통합된 책임, 분산된 실행, 표준화된 연결.**

## 1. Why this model exists

EKODI must be able to take responsibility for the services it officially offers without turning every capability into one tightly coupled application. The architecture therefore separates responsibility ownership from deployment topology.

- **Modular monolith** is the default deployment topology.
- **Responsible Independent Service** is a responsibility and capability boundary.
- A capability can remain in a shared deployment and still be an independent service boundary if its public contract, data boundary, failure behavior and extraction path are explicit.

## 2. Canonical layers

### Governance
Constitution, policy, responsibility, approval and change control. Governance decides what is allowed and who is accountable.

### EKODI OS
Platform-wide execution order and coordination. OS covers orchestration, routing context, service cooperation and guarded operational coordination. It is not a business service and does not absorb all domain logic.

### EKODI Core
Stable shared contracts and controls: identity and access contracts, immutable `workspace_id` authority, service contracts, integration gateways, audit, security policy, provider independence and shared fallback rules.

### EKODI Responsible Independent Service
An EKODI-offered capability for which EKODI remains accountable for service quality, security, privacy controls, observability, fallback, maintenance and user protection. The service keeps a defined domain/data boundary and independent lifecycle readiness.

### External Connected Service
A provider-owned capability connected through a reviewed adapter or contract. The provider owns provider-side availability and operation. EKODI owns scope control, connector behavior, minimum data projection, retries, fallback/degraded behavior, user-facing status and safe disconnection.

### Workspace
A person, organization, group or project operating context identified by immutable `workspace_id`. A Workspace is not a service implementation. Its identity and membership survive service replacement or disconnection.

## 3. Registry separation

`platform-boundaries.json` answers:

> Where is the deployment/source boundary?

`governance/architecture/ekodi-os-architecture.json` answers:

> Which architecture layer is this boundary in, who is responsible, and how may it connect?

The two registries intentionally do not collapse into one file.

## 4. Connection rules

1. Cross-boundary access uses public or explicitly declared APIs, events, webhooks, adapters or equivalent reviewed contracts.
2. Direct private database coupling across Responsible Independent Service boundaries is forbidden.
3. External providers receive only the minimum purpose-bound projection and capability-scoped authorization.
4. Provider credentials remain server-side.
5. Provider or service failure should degrade its capability without collapsing unrelated capabilities where practical.
6. Service disconnection must not redefine canonical EKODI person, workspace or authorization identity.

## 5. Multiple implementations of one capability

A capability is not required to have only one implementation.

For example, `marketing-ai` can have:

- the EKODI implementation,
- an external vendor implementation that conforms to the same capability-scoped contract,
- both implementations used in parallel for comparison or specialization.

Selection may be made by the user, the workspace administrator or EKODI Orchestrator policy. Selection considers user choice, workspace policy, quality, cost, latency, availability, privacy and provider independence.

An external implementation never gains direct private database access merely because it implements the capability contract.

## 6. Current classification

The machine-readable registry classifies every current entry in `platform-boundaries.json`. The architecture validator fails if a new deployment boundary is added without an architecture classification or if an EKODI deployment boundary is incorrectly marked as externally responsible.

Run:

```bash
npm run validate:architecture
```

The full repository check also runs this validator through `npm run check`.

## 7. Change rule

Changes to responsibility ownership, OS/Core boundaries, workspace identity authority or external connection rules are constitutional architecture changes and follow the repository C2/C3 change-control policy as applicable.
