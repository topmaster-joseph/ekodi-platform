# EKODI Learning Loop

EKODI Learning Loop connects the existing Knowledge Source Registry, Core Learning Ledger and Autonomous Discovery/Evolution lifecycle.

## Operating loop

`Collect → Verify → Use → Observe outcome → Evaluate → Remember → Improve`

This is not uncontrolled model self-training. External material remains untrusted reference data. EKODI improves mainly through verified retrieval, outcome evidence, reviewed memory promotion and bounded autonomous research.

## Acquisition order

1. Official connector or API
2. Webhook
3. RSS/Atom
4. Sitemap + changed-only fetch
5. Bounded HTML fetch after robots, terms and rights checks
6. Manually reviewed source

HTML crawling is blocked unless robots permission, terms permission and rights permission are all explicitly verified.

## Learning scopes

- Task: ephemeral execution context.
- Person/workspace: authorized context only.
- Service: reusable patterns for one service.
- Platform: shared knowledge only after repeated verified outcomes and human approval.

Raw user prompts, messages, credentials and private content are not stored in the learning ledger by default. The ledger stores derived evidence and outcome metadata.

## Promotion rules

A high score alone is not enough. Platform-wide promotion requires:
- trusted provenance;
- fresh evidence;
- corroboration;
- at least three repeated verified outcomes;
- no rights, privacy or prompt-injection block;
- explicit human approval.

Learning cannot expand EKODI authority, mutate production, bypass release gates or change constitutional policy.

## Existing integrations

- `ai_core_learning_events` remains the durable Core learning ledger.
- `ekodi-pulse-runtime.js` records verified command outcomes.
- `config/knowledge-source-registry.json` governs source provenance and acquisition.
- Autonomous Discovery/Evolution continues to research and verify structural improvements without automatic production promotion.
