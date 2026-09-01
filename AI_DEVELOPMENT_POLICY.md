# EKODI Parallel Development Policy

This file is the provider-neutral source of truth for AI-assisted and human software development in EKODI.

## Scope

This policy applies equally to Claude Code, ChatGPT/GPT, Codex, Gemini, GitHub Copilot, future AI development agents, remote computers, local computers, CI workers, and human developers.

No AI provider or developer receives a privileged shortcut around this policy.

## Mandatory isolation

Every work request must have a unique `task_id` and must run in an isolated source-control and filesystem context.

Required model:

`task_id -> isolated branch -> isolated worktree/sandbox -> validation -> review -> merge -> guarded deployment`

Rules:

1. Each task uses its own branch. Recommended AI branch format is `ai/<agent>/<task-id>` or `ai/<purpose>/<task-id>`.
2. Each concurrently active task uses its own Git worktree or equivalent isolated sandbox/container/ephemeral checkout.
3. Concurrent agents must never share one mutable working directory.
4. `main`, release branches, and production branches are read-only work inputs for AI agents and ordinary task workers.
5. Direct push or force-push to protected production branches is forbidden for AI agents and ordinary development workers.
6. Direct production deployment from an agent workspace is forbidden.
7. Credentials must be task-scoped and least-privilege. Production credentials are not placed in agent worktrees.
8. A task may prepare a change, tests, migration, rollback, PR, or deployment candidate, but may not bypass the central release gate.

## Automatic task allocation

EKODI provides a repository-level allocator and a local/remote worktree starter so branch/workspace isolation does not depend on a human remembering Git commands.

- `.github/workflows/ai-task-allocator.yml` creates or reuses `ai/<agent>/<task-id>` from an approved base ref. It can be invoked directly or by labeling an issue `ai-task`; optional `agent:<name>` labels select the worker identity.
- `scripts/ai-task-start.sh <agent> <task-id> [base-ref]` creates or reuses the matching branch and a dedicated sibling worktree under `.ekodi-worktrees`.
- Existing task branches are reused rather than silently replaced. Shared mutable workspaces remain forbidden.
- Central orchestrators and future admin UI actions should call this allocator contract rather than inventing provider-specific branch logic.

## Central merge and release gate

All production-bound changes must pass through the same central pipeline regardless of who or what authored them.

Minimum gate:

1. source and syntax validation
2. repository tests
3. constitution and governance validation when applicable
4. security and secret checks
5. platform/tenant boundary checks when applicable
6. human or authorized central review according to impact level
7. pull-request merge through the guarded repository path
8. guarded deployment workflow
9. production verification and rollback visibility

A successful commit, build, local test, or agent statement is not proof of production completion.

## Agent identity and audit

Every automated development action should be attributable to an `agent_id`, `task_id`, branch, commit SHA, and execution environment where practical.

Recommended metadata:

- `agent_id`: `claude`, `chatgpt`, `codex`, `gemini`, `copilot`, `human:<name>`, or another registered worker identity
- `task_id`: immutable identifier for the work request
- `branch`
- `worktree_or_sandbox_id`
- `base_sha`
- `result_sha`
- validation result
- review/merge decision
- deployment result

## Conflict and failure isolation

An agent conflict or failed experiment must remain inside its branch/worktree. Agents must not solve conflicts by overwriting another active worktree or force-updating a shared branch.

When two tasks overlap, the central integration stage decides merge order. A losing branch rebases or regenerates against the accepted state and is revalidated.

`.github/workflows/ai-conflict-guard.yml` enforces this at pull-request time. If another open PR targeting the same base modifies any of the same files, the overlapping PR is blocked until central integration chooses the winning order. The guard also rejects a PR when GitHub reports an actual merge conflict with the base branch.

## Provider independence

AI vendors are replaceable workers behind this development contract. Provider-specific instruction files may explain how a tool should comply, but they must not weaken or redefine this policy.

If a provider-specific instruction conflicts with this file, this policy and `CONSTITUTION.md` take precedence.

## Production authority

AI agents may be allowed to propose, validate, open pull requests, or invoke explicitly guarded release workflows within delegated scope. They must not possess an unrestricted path that edits production source or production infrastructure outside the central gate.

Emergency operation requires a separately documented, auditable break-glass procedure and is not an AI-agent exception.
