# EKODI v1.8 Sovereign Autonomous Operations

Status: Active operating architecture
Effective: 2026-09-05
Constitution: v1.8.0
Generation: 2 (Integrated Platform)
Scale tier: S0 (Seed)

## Operating hierarchy

1. **Sovereign**: constitution, identity, policy, authorization, audit and final control authority.
2. **Autonomous**: Observe → Detect → Reason → Plan → Execute → Verify → Recover → Learn.
3. **Agentic**: Chief Orchestrator delegates bounded capability work to specialist agents and provider adapters.
4. **Services**: UI, Service, Tenant, Knowledge, Content and Agent features deliver user value.

The hierarchy is an authority gradient, not a deployment requirement. A modular monolith may host several layers while contracts and authority boundaries remain explicit.

## Authority contract

Autonomous execution requires **Person + Workspace + Role + Capability**. `workspace_id` remains canonical. URL, provider account and AI identity are never authorization truth. Agents receive capability-scoped tools instead of root credentials.

## Parallel work lanes

| Lane | Default class | Parallel rule |
| --- | --- | --- |
| UI | Green | Independent UI/shell work may proceed after preflight and remains reversible. |
| Service | Yellow | Public contract, rollback and verification are required. |
| Tenant | Yellow | `workspace_id`, membership and capability authority must remain canonical. |
| Knowledge | Green | Purpose-bound retrieval, provenance and workspace authorization are required. |
| Content | Green | Source, publication state and workspace authorization remain explicit. |
| Agent | Yellow | Agent identity, capability tool, mission gate and audit are required. |

Red areas such as Auth, Core schema, Gateway, Policy, Secrets, production deployment/DNS, destructive data and permission expansion remain serialized behind a human gate.

## Autonomous completion definition

A run is complete only when the declared contract and authority are bounded, tests/security checks pass, post-execution verification succeeds, audit evidence exists, and rollback or recovery is defined. Failed verification routes to Recover rather than being reported as completed.

## Cost and scale

v1.8 deliberately keeps Generation 2 and S0. Shared runtime and low-cost capacity remain the default. Optimize root cause, cache, query and workload shape before paid expansion. Dedicated capacity or new boundaries require measured need plus sustainable economics or a documented security/legal/reliability reason.

## Machine-readable sources

- `governance/architecture/sovereign-autonomous-operations.v1.json`
- `config/sovereign-surface-policy.json`
- `sovereign-autonomy-runtime.js`
- `governance/architecture/ekodi-os-architecture.json`
- `governance/architecture/ekodi-evolution-model.json`
