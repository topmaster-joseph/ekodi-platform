# EKODI Web/Computer Execution Plane

Status: candidate implementation contract for issue #2062.

The Web/Computer Execution Plane is a provider-neutral EKODI capability owned by the existing Orchestrator. It is not a browser vendor clone, model feature, external-provider wrapper, second orchestrator, or new sovereign authority.

## Contract

`Universal Capability Contract -> Capability Router -> Web/Computer Execution Plane -> Adapter -> Engine/Provider`

Planner, Worker Pool, Session, Action, Extraction, Verification, Recovery, Observability and Learning remain independently replaceable modules. An initial browser engine may use Chromium/Playwright, but no service may depend on that engine identity.

## Execution order

Prefer deterministic EKODI-owned execution when sufficient. Select self-controlled/local execution before bounded external failover when security, availability and measured requirements permit. Provider failure degrades only the dependent lane and must not transfer task authority away from EKODI Orchestrator.

## Evidence and learning

Each execution records capability, adapter/engine, site/task class, verified result, latency, retries, cost, failure taxonomy and fallback. Learning may propose Router Score or strategy changes only from verified evidence. It cannot grant permissions, activate billing, weaken security, bypass human/provider consent, or promote itself.

## Verification

An action returning success is not task completion. Verification must independently prove the requested postcondition. Network failure, browser crash, invalid input, permission denial, authentication/MFA gate and provider outage are explicit failure-path tests.

## Evolution gate

Changes advance only through Sandbox -> Benchmark -> Canary -> Production Verification with rollback evidence. Better engines replace adapters while preserving the capability contract.

## Security

Use least privilege, purpose-bound data projection, isolated sessions/workers, secret redaction and auditable actions. CAPTCHA or security-control bypass is forbidden. Permission expansion, new paid commitments, destructive/irreversible operations and owner/provider-required consent remain sovereign gates.
