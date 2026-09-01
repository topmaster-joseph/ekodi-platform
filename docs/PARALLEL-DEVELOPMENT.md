# EKODI Parallel Development Protocol

## Purpose

EKODI development must remain safe and scalable when many computers, human developers, Claude Code sessions, ChatGPT/Codex agents, Gemini agents, CI workers, and future AI developers operate at the same time.

The isolation unit is a **task**, not a person, computer, account, model, or vendor.

## Core topology

`request -> task identity -> isolated branch/worktree/environment -> implementation -> validation -> PR -> central review/gates -> merge -> deployment`

No worker receives implied authority to bypass the central path.

## Task identity

A new request receives a unique task identity automatically. Humans should normally only describe the work to be done.

Preferred branch naming:

`task/YYYYMMDD-HHMM-<short-slug>-<short-id>`

Examples:

- `task/20260901-2245-admin-menu-fix-a31f`
- `task/20260901-2247-mall-video-pipeline-82bc`

The short id prevents collisions when two computers start similar tasks at nearly the same time.

## Start algorithm

Every development agent should perform the following before editing:

1. Read the repository engineering instructions.
2. Inspect current repository, branch, remote, status, and default branch.
3. Fetch remote branches and open-task state when available.
4. Determine whether the user's request is a continuation of an existing task.
5. If continuation is clear and safe, continue that task branch.
6. Otherwise generate a unique task id and branch without asking the user for a branch name.
7. Ensure the current filesystem is isolated from other active tasks.
8. Only then change source files.

When uncertain whether an existing branch is the same task, prefer creating a new isolated task and reconcile through PR review rather than risking concurrent writes to one branch.

## Local computers

When several tasks can run on one local clone, use git worktrees so each agent receives a separate filesystem.

Conceptual example:

```bash
git fetch origin --prune
git worktree add ../worktrees/<task-id> -b <task-branch> origin/main
```

The exact base branch must follow the repository's configured default/release model.

A worktree is owned by one active task at a time. A second agent must not share that worktree for simultaneous editing.

## Cloud environments

A cloud development environment may be shared as a reusable **base configuration**, but active task execution must still be isolated by branch and by filesystem/session whenever the environment permits concurrent sessions.

The base environment is not the task identity.

## Continuing work from another computer

A computer does not own a task. To continue a task from another computer:

1. fetch the remote state;
2. locate the matching open task branch/PR;
3. create a fresh local worktree or isolated cloud session for that branch;
4. verify the branch is not being actively edited elsewhere before writing;
5. continue, test, push, and update the same PR.

If simultaneous editing is required, split the work into child tasks with separate branches instead of sharing one branch.

## Completion path

Before reporting implementation complete, the agent must:

- review its diff and scope;
- run applicable tests, lint, build, security, governance, and regression checks;
- commit only current-task changes;
- push the task branch;
- open or update a PR;
- report checks, risks, and unresolved items.

Production merge/deployment is a distinct governed step.

## Central safeguards

Repository configuration should enforce, where supported:

- no direct push to the default/production branch;
- pull request required before merge;
- required CI/status checks;
- required conversation resolution where practical;
- prohibition of force push and branch deletion for protected branches;
- least-privilege credentials;
- auditable deployment identities;
- production deployment only from an approved merge/release path.

Prompt instructions are guidance. GitHub rules and CI gates are the hard guardrails.

## Cross-agent compatibility

`CLAUDE.md`, `AGENTS.md`, repository policy files, CI, and GitHub rules must express the same invariant so that Claude Code, Codex/ChatGPT, Gemini, humans, and future agents converge on one operating model.

Vendor-specific convenience is allowed only when it does not weaken the shared invariant.

## Recovery rules

Never solve a collision by deleting another task's work, using `git reset --hard` on unfamiliar changes, or force-pushing a shared branch. Preserve work first, isolate the conflicting state, then reconcile through normal Git history and PR review.

## Human experience target

The normal user experience should be simply:

> "관리자페이지 메뉴 오류 수정해줘."

The development system should handle task identification, branch/worktree isolation, validation, PR creation, and status reporting automatically. Branch administration is an implementation detail, not routine user work.
