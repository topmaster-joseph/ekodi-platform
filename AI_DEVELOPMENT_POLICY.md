# EKODI Parallel Development Policy

This file is the provider-neutral source of truth for AI-assisted and human software development in EKODI.

## Scope

This policy applies equally to Claude Code, ChatGPT/GPT, Codex, Gemini, GitHub Copilot, future AI development agents, remote computers, local computers, CI workers, and human developers.

No AI provider or developer receives a privileged shortcut around this policy.

## Mandatory isolation

Every work request must have a unique `task_id` and must run in an isolated source-control and filesystem context.

Required model:

`task_id -> isolated branch -> virtualized isolated execution -> validation -> review -> merge -> guarded deployment`

Rules:

1. Each task uses its own branch. Required AI branch format is `ai/<agent>/<task-id>` or another constitutionally registered equivalent.
2. Each concurrently active task uses its own ephemeral virtualized sandbox and source checkout. A Git worktree may be used as source input, but it is not by itself an execution boundary.
3. Concurrent agents must never share one mutable working directory or one mutable runtime.
4. `main`, release branches, and production branches are read-only work inputs for AI agents and ordinary task workers.
5. Direct push or force-push to protected production branches is forbidden for AI agents and ordinary development workers.
6. Direct production deployment from an agent workspace or sandbox is forbidden.
7. Credentials must be task-scoped and least-privilege. Production credentials are not placed in agent worktrees or execution sandboxes.
8. A task may prepare a change, tests, migration, rollback, PR, or deployment candidate, but may not bypass the central release gate.

## Virtualization-first execution

All EKODI mutation-capable development work is virtualization-first. Repository code must not be executed directly on a persistent operator workstation, long-lived agent shell, or production host when an isolated execution provider can perform the task.

Mandatory virtualized operations include:

- code generation that executes generated output
- dependency installation and dependency lifecycle scripts
- builds, tests, linting, static analysis and repository validation
- database migration dry-runs and local service startup
- browser/E2E automation and integration testing
- packaging, artifact generation and executable tooling from the repository
- repair/retest loops performed by autonomous agents

The default execution profile is an ephemeral rootless OCI container with a read-only root filesystem, dropped capabilities, no-new-privileges, workspace-scoped mounts, denied network by default, no host container socket and no production secrets.

Isolation is escalated when the workload requires a stronger boundary:

- `standard`: rootless OCI container for normal trusted repository build/test work.
- `hardened`: gVisor or an equivalent application-kernel sandbox for untrusted executables, third-party tooling with elevated uncertainty, or workloads where reducing direct host-kernel exposure is important.
- `microvm`: Firecracker or an equivalent microVM boundary when kernel-sensitive tooling, stronger tenant separation, or VM-grade isolation is required.

A stronger profile may satisfy a weaker profile requirement. A weaker profile may never silently satisfy a stronger requirement.

If no compliant execution provider is available, the task fails closed or remains pending. It must not silently fall back to direct execution on a persistent host.

Control-plane operations may occur outside an execution sandbox only when they do not execute repository or untrusted code. Examples are read-only metadata retrieval, authorization decisions, audit recording, pull-request metadata operations, guarded merge decisions, and provider API coordination. These control-plane operations remain least-privilege and auditable.

Every autonomous execution provider must return a structured execution receipt bound to the task and source state. At minimum it records the task/branch/base commit, provider identity, isolation profile and technology, ephemeral/workspace isolation evidence, network/root-filesystem/capability posture, production-secret exposure state, authority-expansion state, production-mutation state, and result evidence or digest.

The canonical implementation contract is `autonomous-execution-fabric-runtime.js` plus `config/autonomous-execution-fabric-policy.json`. Provider-specific runtimes are replaceable and may not weaken that contract.

## Automatic task allocation

EKODI provides a repository-level allocator and cross-platform local/remote worktree starter so branch/workspace isolation does not depend on a human remembering Git commands.

- `.github/workflows/ai-task-allocator.yml` creates or reuses `ai/<agent>/<task-id>` from an approved base ref. It can be invoked directly or by labeling an issue `ai-task`; optional `agent:<name>` labels select the worker identity.
- `node scripts/ekodi-task-start.mjs --agent <agent> [--task-id <task-id>] [--base main] <description>` is the canonical Windows/Linux/macOS source bootstrap. It generates a unique task id when one is not supplied and creates a dedicated sibling worktree by default. Commands that execute repository code must then run through the autonomous execution fabric rather than directly in that worktree.
- `scripts/ai-task-start.sh` remains a POSIX source-bootstrap helper for environments where shell automation is convenient.
- Existing task branches are reused rather than silently replaced. Shared mutable workspaces remain forbidden.
- Central orchestrators and future admin UI actions should call this allocator and execution-fabric contract rather than inventing provider-specific branch or runtime logic.

## Central merge and release gate

All production-bound changes must pass through the same central pipeline regardless of who or what authored them.

Minimum gate:

1. source and syntax validation inside an approved virtualized execution profile
2. repository tests inside an approved virtualized execution profile
3. constitution and governance validation when applicable
4. security and secret checks
5. platform/tenant boundary checks when applicable
6. virtualization execution receipt and evidence validation
7. human or authorized central review according to impact level
8. pull-request merge through the guarded repository path
9. guarded deployment workflow
10. production verification and rollback visibility

A successful commit, build, local test, or agent statement is not proof of production completion.

## Agent identity and audit

Every automated development action should be attributable to an `agent_id`, `task_id`, branch, commit SHA, and execution environment where practical.

Required or recommended metadata:

- `agent_id`: `claude`, `chatgpt`, `codex`, `gemini`, `copilot`, `human:<name>`, or another registered worker identity
- `task_id`: immutable identifier for the work request
- `branch`
- `sandbox_id` or equivalent execution identifier
- `isolation_profile`
- `execution_technology`
- `base_sha`
- `result_sha` or result digest
- validation result
- review/merge decision
- deployment result

## Conflict and failure isolation

An agent conflict or failed experiment must remain inside its branch and virtualized sandbox. Agents must not solve conflicts by overwriting another active workspace or force-updating a shared branch.

When two tasks overlap, the central integration stage decides merge order. A losing branch rebases or regenerates against the accepted state and is revalidated in a fresh virtualized execution environment.

`.github/workflows/ai-conflict-guard.yml` enforces source-level overlap at pull-request time. If another open PR targeting the same base modifies any of the same files, the overlapping PR is blocked until central integration chooses the winning order. The guard also rejects a PR when GitHub reports an actual merge conflict with the base branch.

## Completion continuity across interruptions

A session ending, execution-window limit, temporary tool unavailability, connector failure, rate limit, or transient infrastructure failure is a **recoverable interruption**, not completion and not automatically a blocked state. The worker must preserve a checkpoint with task identity, branch/commit, completed and pending steps, latest validation/deployment state, blocking dependency, and next executable step. A subsequent authorized worker resumes from that checkpoint and attempts available authorized fallback providers before escalation. Continuity never expands authority, bypasses credentials or safety gates, permits direct host execution as a convenience fallback, or permits direct production mutation.

## Provider independence

AI vendors, sandbox technologies, cloud vendors and execution hosts are replaceable workers behind this development contract. Provider-specific instruction files may explain how a tool should comply, but they must not weaken or redefine this policy.

If a provider-specific instruction conflicts with this file, this policy and `CONSTITUTION.md` take precedence.

## Production authority

AI agents may be allowed to propose, validate, open pull requests, or invoke explicitly guarded release workflows within delegated scope. They must not possess an unrestricted path that edits production source or production infrastructure outside the central gate.

Production promotion is a control-plane operation over an immutable verified artifact. It is not performed from the development sandbox that built or tested the artifact.

Emergency operation requires a separately documented, auditable break-glass procedure and is not an AI-agent exception.
