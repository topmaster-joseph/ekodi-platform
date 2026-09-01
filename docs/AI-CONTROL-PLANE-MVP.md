# EKODI AI Control Plane MVP

Proposed production hostname: `ai.ekodi.kr`. Production activation remains blocked until this core-service boundary is explicitly registered by the EKODI Constitution change-control process.

The control plane accepts one task, assigns isolated AI workers, prefers free official capabilities, records results, and requires the central EKODI approval/merge/deploy gate for production-impacting work.

Initial providers are replaceable adapters. Browser-session workers are optional and must use user-authorized sessions without bypassing provider security or service limits.


## Mission governance gate
- Every task is evaluated against the executable `ai-governance-runtime.js` policy before model work is dispatched.
- Forbidden mission-boundary violations are recorded as `blocked_policy` and are not sent to model workers.
- Human-gated or insufficiently delegated work may be analyzed and prepared, but provider prompts are constrained to analysis, review, and candidate preparation only.
- Only read-only observation or delegated, reversible, logged, preflight-verified action qualifies for autonomous action.
- The task ledger records policy version, tier, reason, explanation, and analysis-only state for auditability.
- CI validates both the EKODI Constitution and AI mission-governance contract.
## Cognitive control topology
- Control Plane interprets intent and routes specialist/model work.
- Governance Plane evaluates mission policy, release policy, artifact identity, and human gates.
- Execution Plane runs source-changing work only in isolated branches/worktrees or paired account nodes.
- Data Plane remains bounded by portable data contracts and separate development/production accounts.
- Codex, Gemini CLI, Claude Code, official APIs, and replaceable external workers are provider adapters, not sources of platform authority.
- Production mutation is promotion-only: the verified immutable artifact is promoted unchanged through the guarded release controller.
