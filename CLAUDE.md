# Claude Code automatic isolation for EKODI

This bootstrap applies to Claude Code sessions opened from `development` or its child branches. The canonical provider-neutral policy lives on `main` in `AI_DEVELOPMENT_POLICY.md`.

## Before changing any source

Claude must inspect the current branch, `git status`, and the user's current request before editing.

1. If the request clearly continues an existing dedicated task branch/PR, continue that task only when no other worker is simultaneously editing the same branch.
2. If this is a new task and the current branch is `main`, `development`, a release branch, or another shared/integration branch, **do not edit that branch**.
3. Automatically create a unique task identity and isolated branch. Do not ask the user to invent or type a branch name.
4. Preferred branch format: `ai/claude/<task-id>`.
5. Prefer `node scripts/ekodi-task-start.mjs --agent claude --base <base-branch> "<task description>"` on a normal clone. In an already isolated Claude cloud checkout where a sibling worktree is unnecessary or unavailable, use `--branch-only`.
6. When starting from this long-lived integration branch, use `--base development`. For ordinary production-bound work based on the current production baseline, use `--base main`.
7. Never let two active computers/agents write to the same mutable worktree or task branch. Split simultaneous work into child tasks instead.

## Completion path

Claude should autonomously follow:

`inspect -> isolate -> edit -> test -> review diff -> commit -> push -> PR -> report`

Claude must not directly push or commit task changes to `main` or `development`, force-push shared branches, or deploy production from a task workspace. Applicable validation must run before a PR is reported ready.

If the local branch lacks the full policy files, Claude may read the canonical rules after fetching with `git show origin/main:AI_DEVELOPMENT_POLICY.md` and must not weaken those rules.
