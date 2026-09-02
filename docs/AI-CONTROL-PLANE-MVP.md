# EKODI Cognitive Control Plane

Proposed production hostname: `ai.ekodi.kr`. Production activation remains blocked until this core-service boundary is explicitly registered through EKODI Constitution change control.

## Architecture

EKODI separates four responsibilities instead of making one AI a super-admin:

1. **Cognitive Control Plane** interprets intent, plans work, routes replaceable AI/human workers, observes state and requests changes.
2. **Governance Plane** owns policy-as-code, security checks, artifact identity, release authorization, audit and promotion decisions. A requester cannot authorize its own production change.
3. **Execution Plane** performs work only inside bounded environments. Source-changing work uses an isolated branch/worktree or equivalent sandbox. The canonical path is `development -> verification -> production`.
4. **Data Plane** owns portable storage, cache, queue and delivery boundaries through `config/data-plane-contract.json`. Development may not use production data by default.

The executable contract is split between `config/cognitive-control-plane.json`, `cognitive-control-plane.js` and `scripts/validate-cognitive-control-plane.mjs`. The JSON contract is vendor-neutral, the runtime evaluates intents, and CI fails closed when the production path drifts from policy.

## Mission governance

Before model dispatch, every task is evaluated by the existing executable `ai-governance-runtime.js` mission policy. Forbidden/non-negotiable actions are stored as `blocked_policy` and are not sent to workers. Human-gated work may be analyzed and prepared, but provider prompts are constrained from performing the underlying high-impact action. Only observe-only work or delegated, reversible, logged and preflight-verified action qualifies for autonomous execution.

The task ledger records governance input, mission policy version, decision tier, reason, explanation and analysis-only state through additive migration `0052_ai_mission_governance.sql`. Mission and human dignity remain above safety/legal/privacy, informed consent and user agency, community/Jubilee impact, reliability, and finally efficiency/revenue.

## Production invariant

Production application runtime is **promotion-only**. AI, people and CI jobs may observe production within authorized read-only scope, but they do not directly mutate the production runtime. A production code release must originate in verification and promote the same verified immutable application artifact through the guarded release controller. Rebuilding the application artifact during production promotion is forbidden.

The application artifact is built exactly once per release run. Wrangler performs a dry-run bundle into a release directory; static assets are copied into the same artifact; every file receives a SHA-256 digest and an aggregate artifact digest is written to `artifact-manifest.json`. GitHub Actions stores this immutable release artifact. Development-account staging downloads and verifies that digest before deployment. Production later downloads the same Actions artifact, requires the same digest, and uses release configs with `no_bundle = true`, so production does not recompile the Worker.

Environment-specific secrets, database bindings, routes and runtime variables are intentionally outside the application artifact. They are Governance/Runtime bindings rather than reasons to rebuild application code.

Required application promotion evidence is source isolation, build, tests, security, policy, staging smoke verification, artifact identity, release authorization and audit evidence. High-impact operations such as rollback, production secret/DNS changes, destructive data changes, repository force-push and repository deletion remain human-gated.

## Governed data migration lane

Production database schema evolution is not disguised as application promotion. It has its own constrained Governance lane. The default is additive-only migration. The migration set must pass the additive-schema validator, originate after verification, pass staging smoke checks, have an explicit production recovery point, carry release authorization and leave audit evidence. Destructive schema or data changes are not automatic and require a separate human-gated plan.

The AI Control workflow uses the separate Cloudflare Development account for staging. On the production path it verifies the exact application artifact digest that staging used, records a D1 Time Travel recovery bookmark, applies only validated additive migrations, then uploads the prebuilt secret-safe Worker candidate through the guarded controller, verifies it at 0% when an existing production version is present, and promotes that candidate. First deployment is owned by the same guarded manifest. There is no separate production source rebuild or post-promotion `secret put` bypass.

## Provider and worker independence

The orchestration layer is not GPT, Claude, Gemini, Codex or any single provider. Providers and authorized account/session nodes are replaceable workers behind adapters. Core operation must degrade safely when an AI provider is missing rather than making a provider the platform's source of authority.

Browser-session or account-backed workers are optional execution nodes and must use user-authorized sessions without bypassing provider security, terms or service limits. Their code work still receives an isolated branch and remains behind the same governance/promotion path.

## Audit and reconciliation

Every mutation path is expected to leave durable decision evidence: request, actor, intent, target, policy version, decision, artifact identity and timestamp. Desired state comes from versioned policy and release manifests. Drift is detected and reconciled through the guarded path rather than repaired by an untracked emergency mutation.

## Connection classes and free-first execution

The provider-neutral worker layer distinguishes four connection classes. Gemini official API is the preferred direct cloud path when a free-tier `GEMINI_API_KEY` is configured. User-authorized account nodes keep provider authentication on the node itself and poll `ai.ekodi.kr` outbound. Optional paid OpenAI and Anthropic APIs remain fallback adapters, while `AI_WORKER_URL/TOKEN` is the provider-neutral extension point.

The default cost-aware order is Gemini free API, a ChatGPT-plan Codex node, a Gemini CLI node, an explicitly enabled Claude Code node, then optional paid APIs or approved external adapters. Availability and an explicit task provider choice may narrow this plan.

`node:codex` executes the official Codex CLI with the ChatGPT login that remains on that computer. `node:gemini-cli` executes the officially authenticated Gemini CLI with read-only `plan` mode for non-coding tasks and bounded `auto_edit` mode inside an isolated coding worktree. Claude Code is enabled only when its official account/subscription authentication is present. Consumer web interfaces are not scraped to bypass API or plan boundaries.

## Account-node pairing

An authenticated EKODI administrator creates a short-lived one-time pairing code. The node exchanges it for a node-specific secret, advertises only providers it can currently execute, and polls for leased jobs. Pairing codes and node secrets are stored in D1 as SHA-256 hashes. Provider passwords, browser cookies and CLI credential files never leave the provider node.

Account nodes are outbound-only. They require no router port forwarding or public PC endpoint. Code tasks still receive the same isolated branch/worktree, central validation and Governance promotion gates as cloud API workers.
