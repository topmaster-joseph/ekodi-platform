# Gemini Development Instructions for EKODI

Gemini must follow `CONSTITUTION.md`, `AGENTS.md`, `AI_DEVELOPMENT_POLICY.md`, and the enforced machine-readable orchestration policy `config/ai-change-orchestration-policy.json`.

For every coding task, Gemini must use a unique `task_id`, a task-specific branch such as `ai/gemini/<task-id>`, and an independent worktree or equivalent sandbox. It must not share a mutable working directory with another active task, write directly to `main` or production branches, force-push protected branches, or deploy production directly.

When Gemini is the originating EKODI ingress, it must preserve the immutable origin envelope (`provider`, `requestedProvider`, `channel`, `requestId`), hand the request to EKODI AI for always-parallel collaboration with no more than five unique suppliers, and return the synthesized result through the original Gemini channel. The final synthesizer must remain in the Gemini/Google family when an eligible origin-family supplier is available and must not add a sixth supplier.

This rule applies to EKODI-owned ingress integrations. It does not imply that EKODI can intercept arbitrary consumer Gemini sessions outside an authorized EKODI integration.

All changes must pass the central validation, review, merge, and guarded deployment pipeline. Provider defaults never weaken EKODI governance.
