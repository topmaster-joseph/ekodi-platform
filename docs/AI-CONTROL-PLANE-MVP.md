# EKODI Cognitive Control Plane

Canonical AI orchestration hostname: `ai.ekodi.kr`.

## Architecture

EKODI separates four responsibilities instead of making one AI a super-admin:

1. **Cognitive Control Plane** interprets intent, plans work, routes replaceable AI/human workers, observes state and requests changes.
2. **Governance Plane** owns policy-as-code, security checks, artifact identity, release authorization, audit and promotion decisions. A requester cannot authorize its own production change.
3. **Execution Plane** performs work only inside bounded environments. Source-changing work uses an isolated branch/worktree or equivalent sandbox. The canonical path is `development -> verification -> production`.
4. **Data Plane** owns portable storage, cache, queue and delivery boundaries through `config/data-plane-contract.json`. Development may not use production data by default.

The executable contract is split between `config/cognitive-control-plane.json`, `cognitive-control-plane.js` and `scripts/validate-cognitive-control-plane.mjs`. The JSON contract is vendor-neutral, the runtime evaluates intents, and CI fails closed when the production path drifts from policy.

## Production invariant

Production is **promotion-only**. AI, people and CI jobs may observe production within authorized read-only scope, but they do not directly mutate the production runtime. A production code release must originate in verification and promote the same verified immutable artifact through the guarded release controller. Rebuilding the artifact during production promotion is forbidden.

Required promotion evidence is source isolation, build, tests, security, policy, staging smoke verification, artifact identity, release authorization and audit evidence. High-impact operations such as rollback, production secret/DNS changes, destructive data changes, repository force-push and repository deletion remain human-gated.

The AI Control workflow uses the separate Cloudflare Development account for staging. On the production path it first records a D1 Time Travel recovery bookmark, applies only validated additive migrations after staging succeeds, then uploads a secret-safe 0% Worker candidate through the guarded controller, verifies it, and promotes that same candidate. First deployment is owned by the same guarded manifest. There is no separate production `wrangler deploy` bootstrap or post-promotion `secret put` bypass.

## Provider and worker independence

The orchestration layer is not GPT, Claude, Gemini, Codex or any single provider. Providers and authorized account/session nodes are replaceable workers behind adapters. Core operation must degrade safely when an AI provider is missing rather than making a provider the platform's source of authority.

Browser-session or account-backed workers are optional execution nodes and must use user-authorized sessions without bypassing provider security, terms or service limits. Their code work still receives an isolated branch and remains behind the same governance/promotion path.

## Audit and reconciliation

Every mutation path is expected to leave durable decision evidence: request, actor, intent, target, policy version, decision, artifact identity and timestamp. Desired state comes from versioned policy and release manifests. Drift is detected and reconciled through the guarded path rather than repaired by an untracked emergency mutation.
