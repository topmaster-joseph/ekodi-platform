# EKODI Multi-Node Execution Policy

Status: mandatory execution policy
Effective: 2026-09-27

## Purpose
EKODI must not stop because one execution channel, PC, quota, provider, or deployment path is unavailable. The Orchestrator owns routing, isolation, verification, and failover.

## Mandatory execution order
1. Healthy physical remote execution nodes.
2. Isolated local virtualization/container/worktree execution on healthy nodes.
3. Other healthy physical nodes, with parallel dispatch when work is independent.
4. Cloud execution runners.
5. Service-native execution paths (GitHub, Supabase, Cloudflare, etc.) when appropriate.

The order is a preference, not a blocking chain. A failed, offline, quota-exhausted, permission-blocked, or unhealthy tier MUST be skipped automatically.

## Node rules
- Register every available EKODI execution PC as an independent node; never impose a single-online-node policy.
- Agents must start with the OS, run in the background, restart after failure, and reconnect automatically.
- Health checks must record online/offline, heartbeat age, current load, quota/usage state, permissions, and active jobs.
- Independent jobs SHOULD be distributed concurrently across healthy nodes.
- A node must not receive a new job when its execution provider reports quota exhaustion.
- Where supported, Wake-on-LAN may restore an offline physical node, but failure to wake must not block other routes.

## Isolation
Every development job uses its own branch plus isolated worktree, VM, container, or equivalent workspace. No AI worker may modify production directly. Parallel workers must not share a mutable working directory.

## Failover
Failover triggers include offline node, stale heartbeat, provider quota, timeout, authentication failure, permission denial, resource pressure, deployment quota, and repeated command failure.
On a trigger, preserve logs and job state, mark the route unhealthy, and immediately choose the next viable route. Do not repeatedly retry a known quota-exhausted channel.

## Verification and deployment
All outputs converge through central review: tests -> policy/path guards -> staging/preview where available -> production deployment -> post-deploy health check. Production success may be reported only after the deployed target is verified.

## Orchestrator invariant
Entry AIs are request gateways. EKODI Orchestrator is the execution owner. The platform administrator retains final authority. Execution-provider limitations must be treated as routing conditions, not as reasons to abandon a requested job.

## Required dashboard state
Expose node inventory, health, last heartbeat, execution mode, active job, quota state, failover reason, branch/workspace, verification state, and deployment state.