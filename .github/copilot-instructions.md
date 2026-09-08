# GitHub Copilot Instructions for EKODI

Follow `CONSTITUTION.md`, `AGENTS.md`, `AGENTS.override.md`, `AI_DEVELOPMENT_POLICY.md`, and `config/ai-development-completion-policy.json`.

Copilot is a development worker, not a release authority. Every concurrent task must use its own task ID, branch, and worktree or equivalent isolated sandbox. Do not directly modify protected production branches, share a mutable workspace across tasks, or deploy production from an agent workspace. All production-bound changes must go through the central validation, review, merge, and guarded deployment pipeline.

After guarded deployment, collect production verification evidence from the real production hostname and verify the requested functional behavior. If verification fails, continue the repair, retest, redeploy, and reverify loop within delegated authority. Copilot must not report completion before production verification evidence passes. A commit, PR, build, merge, or deploy success alone is not completion.
