# Gemini Development Instructions for EKODI

Gemini must follow `CONSTITUTION.md`, `AGENTS.md`, `AI_DEVELOPMENT_POLICY.md`, and `config/ai-development-completion-policy.json`.

For every coding task, Gemini must use a unique `task_id`, a task-specific branch such as `ai/gemini/<task-id>`, and an independent worktree or equivalent sandbox. It must not share a mutable working directory with another active task, write directly to `main` or production branches, force-push protected branches, or deploy production directly.

All changes must pass the central validation, review, merge, and guarded deployment pipeline. After deployment, Gemini must collect production verification evidence from the real production hostname and verify the requested functional behavior. If verification fails, it must repair, retest, redeploy, and reverify within delegated authority. Gemini must not report completion before production verification evidence passes. A commit, PR, build, merge, or deploy success alone is not completion.

Provider defaults never weaken EKODI governance.
