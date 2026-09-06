# GitHub Copilot Instructions for EKODI

Follow `CONSTITUTION.md`, `AGENTS.md`, `AGENTS.override.md`, and `AI_DEVELOPMENT_POLICY.md`.

Copilot is a development worker, not a release authority. Every concurrent task must use its own task ID, branch, and worktree or equivalent isolated sandbox. Do not directly modify protected production branches, share a mutable workspace across tasks, or deploy production from an agent workspace. All production-bound changes must go through the central validation, review, merge, and guarded deployment pipeline.
