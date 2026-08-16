# EKODI AI Action Gateway

## Purpose

The AI Action Gateway turns EKODI mission governance into a server-side execution boundary. Chief AI and specialist AIs do not receive a general-purpose production key. Every proposed action is classified before it can become an execution.

The gateway is intentionally narrow. Autonomy grows by adding explicitly reviewed executors, not by giving an AI unrestricted infrastructure access.

## Control API

All routes are under `/api/control/ai` and require an authenticated EKODI administrator session.

- `GET /governance` — read the active runtime policy, registered agents, human-gate areas, and forbidden areas.
- `POST /evaluate` — evaluate a proposed action without executing it.
- `GET /actions` — read the persistent action/audit queue. Supports `limit`, `status`, and `agentId` filters.
- `POST /actions` — register a proposed action, evaluate it, persist the decision, and execute only when a safe executor is explicitly registered.
- `POST /actions/:id/decision` — approve or reject an action that is waiting at a human gate. Approval does not magically create an executor; it becomes `approved_pending_executor` until an explicitly implemented executor exists.

## Action states

- `blocked` — forbidden by mission policy.
- `awaiting_human` — a human steward must decide.
- `assist_only` — AI may analyze/recommend but cannot execute.
- `ready_for_executor` — policy permits guarded reversible execution, but no executor is registered yet.
- `executing` — an explicit safe executor is running.
- `verified` — execution completed successfully and the result was recorded.
- `failed` — executor failed or post-execution verification did not succeed.
- `approved_pending_executor` — human approval exists but no automatic executor is implied.
- `rejected` — human steward declined the action.

## Initial autonomous executor

The first and only autonomous executor in this release is:

`service.health_check`

It is restricted to the `health_checks` observation area. It invokes the existing EKODI Control API service check, records the proposal and policy decision first, and stores the verified result afterward.

This is deliberate. We begin with an observable, read-oriented, recoverable operation before adding actions that mutate production state.

## Runtime policy

`ai-governance-runtime.js` contains the Cloudflare-safe execution policy used by the gateway. CI validates it against the full source-of-truth policy in `config/ai-mission-governance.json` so the runtime cannot silently drift from the mission constitution.

Unknown agents default to `human_gate`. Forbidden actions cannot be overridden by Chief AI. A request that reduces user rights or reaches across tenant-private data boundaries also escalates to a human gate.

## Persistence and audit

`migrations/0020_ai_agent_actions.sql` creates the persistent `ai_agent_actions` ledger. Each entry records:

- requesting agent and action type;
- mission area and target;
- rationale and bounded payload;
- policy tier and reason;
- requestor identity and timestamps;
- human decision when required;
- execution result and verification timestamp.

The ledger is an operational record, not permission by itself.

## Expansion rule

A new autonomous executor may be added only when all of the following are true:

1. The action has a narrow named type.
2. Tenant and resource scope can be determined before execution.
3. Mission policy evaluates the action before any side effect.
4. The operation is reversible or explicitly human-gated.
5. Preflight checks are deterministic enough to fail closed.
6. Post-execution verification is defined.
7. Audit evidence is persisted.
8. Rollback behavior is known.
9. CI and guarded production verification cover the new path.

The objective is not to make Chief AI powerful. It is to make delegated AI service trustworthy.
