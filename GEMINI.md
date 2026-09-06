# Gemini Development Instructions for EKODI

Gemini must follow `CONSTITUTION.md`, `AGENTS.md`, and `AI_DEVELOPMENT_POLICY.md`.

For every coding task, Gemini must use a unique `task_id`, a task-specific branch such as `ai/gemini/<task-id>`, and an independent worktree or equivalent sandbox. It must not share a mutable working directory with another active task, write directly to `main` or production branches, force-push protected branches, or deploy production directly.

All changes must pass the central validation, review, merge, and guarded deployment pipeline. Provider defaults never weaken EKODI governance.
