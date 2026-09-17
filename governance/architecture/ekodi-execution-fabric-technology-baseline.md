# EKODI Generation 10 Execution Fabric Technology Baseline

Status: enforced architecture baseline for mutating engineering work
Date: 2026-09-17
Generation: 10 — Self-Architecture Optimization

## Decision

EKODI does not bind autonomous engineering to one AI, one workstation, one runner, or one cloud provider. All mutating engineering work must pass a provider-independent execution fabric. Read-only observation may remain lightweight, but code, configuration, schema, build, infrastructure, deployment, release, automation, and generated-artifact mutations require an isolated execution boundary before merge or release.

## S0 default

The default execution profile is an ephemeral cloud VM with a second rootless-container boundary. The inner sandbox must run non-root, default network deny, read-only root filesystem, all Linux capabilities dropped, no-new-privileges enabled, explicit workspace mounts only, no host Docker socket, and no production secrets.

The currently proven S0 provider is a GitHub-hosted ephemeral runner with rootless Podman. The provider is an implementation detail, not the authority owner.

## Provider hierarchy

1. `s0-default` — ephemeral cloud VM + rootless Podman. Use for normal implementation, build, test, lint, migration dry-runs, and non-production service execution.
2. `strong-vm` — dedicated per-task VM sandbox, with Cloudflare Sandbox as a candidate managed provider. Activate only when account entitlement/budget and provider-adapter runtime evidence exist.
3. `high-isolation` — gVisor or Firecracker-compatible isolation for workloads whose threat model justifies stronger boundaries or dedicated capacity.

Fallback is allowed only when the replacement preserves or increases isolation. Provider lock-in is prohibited.

## Why not an always-on self-hosted runner

Persistent self-hosted runners increase the risk that untrusted or model-generated code can leave durable state or compromise later jobs. At S0, EKODI therefore prefers clean ephemeral cloud compute. A future self-hosted provider is acceptable only if each job receives a newly created disposable VM or equivalent stronger isolation and the host is destroyed or cryptographically reset after the job.

## Why not Kubernetes at S0

Kubernetes is not the default control plane. The current workload does not justify its operational complexity, attack surface, or cost. EKODI keeps a small control plane and ephemeral execution workers. Kubernetes may be introduced only after measured concurrency, scheduling, tenancy, or availability requirements justify it.

## Production boundary

The execution sandbox never owns production mutation. Production promotion must use the independent release gateway and a verified immutable artifact. Red-class changes remain sovereign-human-gated. Failed staging or production verification must block promotion or trigger recovery to a known stable target.

## Credential model

Long-lived production credentials do not enter the execution sandbox. The target model is workload identity or short-lived scoped credentials issued by a credential broker and revoked at completion. OIDC/workload identity is preferred over static cloud keys where provider support exists.

## Supply-chain baseline

Before autonomous production readiness can be claimed, the release path must add and verify:

- immutable action/container references or equivalent provenance controls;
- dependency and build SBOM generation;
- artifact digest continuity from build through staging and production;
- signed or attestable build provenance suitable for independent verification;
- least-privilege workflow permissions;
- secret scanning and dependency/security checks appropriate to the changed surface.

These are activation requirements, not a reason to weaken the current isolation boundary.

## Evidence

The first runtime proof is stored at `evidence/runtime/autonomous-execution-fabric/2026-09-17-initial-proof.json`. It proves a non-production rootless isolated execution boundary and authority/provider contracts. It does not prove autonomous production readiness.

## Operating rule

External AI systems may receive intent, reason, propose code, and work as delegated workers. EKODI Orchestrator remains the task owner. A mutating change is not complete merely because an external AI or connector wrote a branch: it must be replayed/validated through the execution fabric, pass the constitutional and orchestration gates, and then follow the governed release path.
