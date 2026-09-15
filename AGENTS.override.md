# Mandatory EKODI Development Override

This repository uses provider-neutral parallel-development isolation.

Before modifying source, read and obey:

1. `CONSTITUTION.md`
2. `governance/constitution/supreme-attributes.v1.json`
3. `AI_DEVELOPMENT_POLICY.md`
4. `AGENTS.md`
5. `config/ai-development-completion-policy.json`
6. `config/autonomous-operations-policy.json`

For ChatGPT/GPT, Codex, and any agent that reads AGENTS instructions:

- every task requires a unique `task_id`;
- before architecture, implementation, review, deployment or operational change, assess impact against all 21 Supreme Attributes and select a design that preserves every mandatory floor;
- no agent, provider, service or workspace may waive or locally override a Supreme Attribute; unresolved tension or a required exception is a constitutional C2/C3 matter for sovereign human authority;
- operate autonomously within already delegated authority instead of turning routine technical choices into repeated owner approvals;
- simplify, reuse, remove duplication and reduce unnecessary complexity before creating another feature, service, workflow or management step;
- resolve routine bugs, consistency gaps, reversible UX improvements, test gaps, accessibility, performance, security hardening and deployment reliability autonomously when they do not expand authority or cross an existing approval gate;
- escalate to sovereign human authority only for value/philosophy changes, material legal/financial/privacy/security risk, hard-to-reverse publication/deletion/external commitments, owner-only authentication or consent, constitutional C2/C3 matters, permission expansion, destructive operations, paid commitments, or important choices requiring human value judgment;
- before adding something, ask whether the same outcome can be achieved by simplification, reuse, consolidation or removal;
- prefer small reversible experiments over speculative permanent complexity;
- routine process narration is not required; report concise status only when the owner needs a decision, attention, material risk awareness, or verified completion information;
- use an isolated task branch, preferably `ai/<agent>/<task-id>`;
- use an isolated Git worktree or equivalent sandbox for concurrent work;
- when operating in a Git checkout and no already-isolated sandbox was provisioned, bootstrap the task with `node scripts/ekodi-task-start.mjs --agent <agent> [--task-id <task-id>] [--base main] <description>` rather than editing the shared checkout;
- central/cloud task creation should use `.github/workflows/ai-task-allocator.yml` or its contract so branch naming and allocation are consistent across providers;
- never share a mutable working directory with another active agent/developer task;
- never write or force-push directly to `main` or production branches;
- never deploy production directly from the task workspace;
- run applicable validation/tests and submit changes to the central PR/review/merge/deploy pipeline;
- overlapping open PR files are serialized by `.github/workflows/ai-conflict-guard.yml`; do not bypass the guard by force-updating another task branch;
- do not use production credentials in the task workspace;
- for production-bound development, a commit, pull request, successful build, or successful deploy command is not completion;
- after guarded deployment, verify the real production service and the requested functional behavior, not only a preview URL or HTTP status;
- record production verification evidence including the task ID, branch, commit SHA, deployment result, production hostname, functional checks, observability check, and verification timestamp;
- if production verification fails, repair, retest, redeploy, and reverify within delegated authority instead of reporting completion;
- until real production verification passes, the agent must not report the task as complete. Use a non-complete status such as `deployed-awaiting-production-verification`;
- treat a session end, execution-window limit, temporary tool/connector failure or rate limit as a recoverable interruption, never as completion;
- before yielding recoverable work, preserve a checkpoint with task/branch/commit, completed/pending steps, validation/deployment state, blocking dependency and next executable step; resume from that checkpoint and try available authorized fallback paths before escalation;
- bounded exceptions are allowed only for the classes declared by `AI-COMPLETE-001`, with the exception class and reason recorded and without any false production-completion claim.

`AI_DEVELOPMENT_POLICY.md` is the provider-neutral development policy. `config/ai-development-completion-policy.json` is the machine-readable completion contract. `config/autonomous-operations-policy.json` is the machine-readable autonomy and owner-escalation contract. No model/provider-specific instruction may weaken these policies.

The 21 Supreme Attributes are binding across current and future generations. Agent speed, novelty, local optimization or provider convenience never overrides them.
