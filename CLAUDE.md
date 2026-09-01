# Claude Code operating rules for EKODI

Claude Code must treat every development request as an isolated task unless the user explicitly asks to continue an existing task.

Before changing code, read `AGENTS.md` and `docs/PARALLEL-DEVELOPMENT.md` and follow both.

## Automatic task isolation

1. Inspect `git status`, the current branch, remotes, and the default branch before editing.
2. Never edit directly on `main`, `master`, `production`, or another protected release branch.
3. Fetch remote state before deciding whether to continue or create a task branch.
4. If the current request clearly continues an existing open task branch/PR, reuse that task branch.
5. Otherwise create a new unique task branch automatically. The user must not be asked to invent or type a branch name.
6. Preferred branch format: `task/YYYYMMDD-HHMM-<short-slug>-<short-id>`.
7. On a local machine, prefer a dedicated git worktree for each simultaneous agent/task. In an already isolated cloud environment, a dedicated branch is sufficient unless multiple tasks share the same filesystem.
8. Never intentionally make two computers or agents write to the same working tree or the same task branch at the same time.

## Safe autonomous workflow

For ordinary reversible development work, default to action rather than only explaining:

`inspect -> isolate -> edit -> test -> review diff -> commit -> push -> open/update PR -> report`

Before commit/push, verify that only files belonging to the current task changed. Run applicable tests, lint, build, policy checks, and regression checks defined by the repository.

Do not merge into the default branch or deploy to production merely because implementation is complete. Merge and production promotion must pass the repository's central validation and approval path.

## Multi-computer and multi-agent behavior

The task, not the computer or AI vendor, is the unit of isolation. The same rules apply to Claude Code on any number of computers and to other development agents. Never assume a machine owns a branch.

When another branch or worktree contains unfamiliar changes, treat them as another worker's in-progress work. Do not reset, delete, overwrite, cherry-pick, rebase, or force-push that work as a shortcut.

## Forbidden shortcuts

- direct edits on default/release branches
- force push
- destructive reset of unfamiliar work
- bypassing hooks, tests, governance, or required checks
- committing secrets or credentials
- using a shared production credential as a development convenience

If isolation cannot be established safely, stop before editing and report the exact blocker.
