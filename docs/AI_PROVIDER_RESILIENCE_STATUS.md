# AI Provider Resilience rollout status

This file records the first ecosystem-wide rollout of EKODI's provider-independent service policy.

- Shared runtime: `ai-resilience-runtime.js`
- Governance contract: `config/ai-provider-independence.json`
- Mandatory validator: `scripts/validate-ai-provider-independence.mjs`
- No-provider CI: `AI_PROVIDER=NONE` + `npm run test:ai-none`
- Guarded Worker releases: no-provider gate runs before candidate attachment/promotion
- Guarded Pages releases: no-provider gate runs before preview/production deployment
- Creator AI: missing/failing provider degrades to deterministic `free_assist` without consuming AI units
- Core operation rule: Auth, Admin manual controls, read/write/save, membership state, queues, backup and recovery remain outside the AI provider dependency boundary

Provider-specific integrations should migrate behind the shared resilience adapter when touched. A new or modified service must not introduce a provider dependency into a core capability.
