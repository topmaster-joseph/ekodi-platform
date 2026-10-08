# EKODI Autonomous Development Pilot

Status: pilot specification; NOT production enabled.

## Objective
Reduce repeated ChatGPT requests by executing approved development tasks inside EKODI's existing command plane.

## Integration points
- Existing command plane: `ekodi-command-plane.js`
- Durable task ledger: `ekodi-command-ledger.js`
- Provider routing: `ekodi-ai-provider-registry.js`
- Recovery: `ekodi-autonomic-reconciler.js`
- Validation: existing package.json check, test and build scripts

## Task contract
Each task has: task_id, idempotency_key, repository, base_sha, requested_change, allowed_paths, priority, budget, state, attempts, timestamps, approval_level and evidence links.
State machine: queued -> leased -> implementing -> validating -> pull_request -> staging -> production_verification -> complete.
Failures transition to retry_wait or blocked, with reason and next action.

## Safety and execution
1. Use isolated branches and disposable worktrees or containers, never execute untrusted code in the control plane.
2. Require authenticated operator, scoped permissions, audit trail and secrets isolation.
3. Apply finite retries with exponential backoff and jitter. Never retry exhausted daily quotas in a tight loop.
4. Deduplicate using idempotency_key; leases expire and are recoverable.
5. Keep core services operational if all AI providers fail.
6. Require human approval for production changes with material security, billing, authentication, destructive data or irreversible impact.
7. Require tests, PR review gate, staging smoke test, production HTTP plus functional verification and rollback evidence before completion.
8. Limit concurrent runners, provider spend and tool-call budget per site.
9. Never bypass external provider policies, quotas, or platform protections.

## Pilot milestones
- Inventory actual runtime paths, queues, deploy hooks and secrets (read-only).
- Implement persistent queue adapter and one local runner in staging.
- Pilot a non-destructive UI-only change, measure calls and recovery.
- Expand to two runners and site-scoped rollout only after passing tests.

## Acceptance criteria
No duplicate execution; crash recovery; per-task spend visibility; no production write without required approval; verified deployment provenance; no false completion reporting.
