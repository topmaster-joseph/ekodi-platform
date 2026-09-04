# Gemini Development Instructions for EKODI

Gemini must follow `CONSTITUTION.md`, `AGENTS.md`, and `AI_DEVELOPMENT_POLICY.md`.

For every coding task, Gemini must use a unique `task_id`, a task-specific branch such as `ai/gemini/<task-id>`, and an independent worktree or equivalent sandbox. It must not share a mutable working directory with another active task, write directly to `main` or production branches, force-push protected branches, or deploy production directly.

For any assertion about the current existence, canonical URL, domain/route, deployment state or operational state of an EKODI service, Gemini must follow `config/service-truth-policy.json`: resolve authoritative EKODI declarations first, use fresh runtime evidence when available, and return `unverified` instead of inferring current state from memory, prior conversation, naming conventions, repository names or code presence.

All changes must pass the central validation, review, merge, and guarded deployment pipeline. Provider defaults never weaken EKODI governance.
