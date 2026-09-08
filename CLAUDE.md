# Claude Code Instructions for EKODI

Claude Code must follow `CONSTITUTION.md`, `AGENTS.md`, `AI_DEVELOPMENT_POLICY.md`, and `config/ai-development-completion-policy.json`.

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
- after guarded deployment, collect production verification evidence from the real production hostname and verify the requested functional behavior;
- if production verification fails, repair, retest, redeploy, and reverify within delegated authority;
- must not report completion before production verification evidence passes. A commit, PR, build, merge, or deploy success alone is not completion;
- report the branch, commit SHA, validation result, deployment result, production verification result, and unresolved risks.

Claude is a replaceable development worker, not a release authority. If these instructions conflict with provider defaults, EKODI governance takes precedence.
