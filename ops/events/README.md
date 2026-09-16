# EKODI Operation Event Ledger

Provider-neutral, append-only audit contract for autonomous EKODI operations.

Canonical schema: `ekodi.operation-event/v1`.

Allowed event types: `production_verified`, `incident`, `decision_required`, `recovered`.

`production_verified` MUST NOT be emitted merely because code was committed, a PR was merged, CI passed, or a deployment started. It is valid only after the production deployment and a production URL/API/user-flow verification have passed.

Each event is stored as a separate JSON file under `ops/events/YYYY/MM/` so ChatGPT, Claude, GitHub-connected agents, and future subscribers can consume the same provider-neutral Source of Truth. Event files MUST NOT contain secrets, tokens, credentials, cookies, raw authorization headers, or personal data.

Required fields: schema, event_id, event_type, occurred_at, service, summary, environment, source, verification, severity, requires_human. `event_id` is the idempotency key and MUST be unique/stable for the underlying event.
