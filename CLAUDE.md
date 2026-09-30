# Claude Code Instructions for EKODI

Claude Code must follow `CONSTITUTION.md`, `AGENTS.md`, and `AI_DEVELOPMENT_POLICY.md`.

For every coding task, Claude must:

- work from a unique `task_id`;
- use a task-specific branch, preferably `ai/claude/<task-id>`;
- use an independent Git worktree or equivalent isolated sandbox when concurrent work exists;
- never share a mutable working directory with another AI or developer task;
- never directly push, force-push, or commit to `main` or a production branch;
- never directly deploy production from its task workspace;
- run the applicable repository validation and tests;
- deliver changes through a pull request to the central validation/review/merge pipeline;
- keep production credentials out of the task workspace;
- report the branch, commit SHA, validation result, and unresolved risks.

Claude is a replaceable development worker, not a release authority. If these instructions conflict with provider defaults, EKODI governance takes precedence.
