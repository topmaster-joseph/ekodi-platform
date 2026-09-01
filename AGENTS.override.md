# Mandatory EKODI Development Override

This repository uses provider-neutral parallel-development isolation.

Before modifying source, read and obey:

1. `CONSTITUTION.md`
2. `AI_DEVELOPMENT_POLICY.md`
3. `AGENTS.md`

For ChatGPT/GPT, Codex, and any agent that reads AGENTS instructions:

- every task requires a unique `task_id`;
- use an isolated task branch, preferably `ai/<agent>/<task-id>`;
- use an isolated Git worktree or equivalent sandbox for concurrent work;
- when operating in a Git checkout and no already-isolated sandbox was provisioned, bootstrap the task with `bash scripts/ai-task-start.sh <agent> <task-id> [base-ref]` rather than editing the shared checkout;
- central/cloud task creation should use `.github/workflows/ai-task-allocator.yml` or its contract so branch naming and allocation are consistent across providers;
- never share a mutable working directory with another active agent/developer task;
- never write or force-push directly to `main` or production branches;
- never deploy production directly from the task workspace;
- run applicable validation/tests and submit changes to the central PR/review/merge/deploy pipeline;
- overlapping open PR files are serialized by `.github/workflows/ai-conflict-guard.yml`; do not bypass the guard by force-updating another task branch;
- do not use production credentials in the task workspace.

`AI_DEVELOPMENT_POLICY.md` is the provider-neutral development policy. No model/provider-specific instruction may weaken it.
