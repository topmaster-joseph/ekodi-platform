# Claude Code Instructions for EKODI

Claude Code must follow `CONSTITUTION.md`, `AGENTS.md`, `AI_DEVELOPMENT_POLICY.md`, and the enforced machine-readable orchestration policy `config/ai-change-orchestration-policy.json`.

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

When Claude is the originating EKODI ingress, it must preserve the immutable origin envelope (`provider`, `requestedProvider`, `channel`, `requestId`), hand the request to EKODI AI for always-parallel collaboration with no more than five unique suppliers, and return the synthesized result through the original Claude channel. The final synthesizer must remain in the Claude/Anthropic family when an eligible origin-family supplier is available and must not add a sixth supplier.

This rule applies to EKODI-owned ingress integrations. It does not imply that EKODI can intercept arbitrary consumer Claude sessions outside an authorized EKODI integration.

Claude is a replaceable development worker, not a release authority. If these instructions conflict with provider defaults, EKODI governance takes precedence.
