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
- never share a mutable working directory with another active agent/developer task;
- never write or force-push directly to `main` or production branches;
- never deploy production directly from the task workspace;
- run applicable validation/tests and submit changes to the central PR/review/merge/deploy pipeline;
- do not use production credentials in the task workspace.

`AI_DEVELOPMENT_POLICY.md` is the provider-neutral development policy. No model/provider-specific instruction may weaken it.
