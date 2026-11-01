# EKODI GitHub Control: verified webhook readiness and cross-worker budget observability

Tracks issue #6630; EKODI Orchestrator remains the **only** release and execution authority.

## Added
- Read-only super-admin Github Control panel at `/admin/control` now distinguishes Webhook enabled flag, presence of the signing secret, valid GitHub App installation ID, and the **existence of actual signed operational events**. A successful signed ping alone is deliberately not counted as an operational event. The latest actual signed event time and exact accumulated signed-event count are derived from D1; no credentials are exposed.
- Additive D1 table `github_operations_api_budgets` stores **only** GitHub REST `x-ratelimit-resource`, limit, remaining, reset, observation time and throttle deadline per installation. There is **no GitHub token, response payload, access actor, email, or URI** in the table.
- Server-only module `github-api-budget-control.js` parses and validates full GitHub rate headers, requires `authenticatedServerCall:true` and positive installation ID before accepting an observation, and uses a parameterized monotonic-timestamp upsert to reject stale overwrites. It has no public write API, no browser writer and no outgoing GitHub call.
- API read-model returns measured numbers **only while fresh (120 seconds) and before GitHub reset**; expired or absent readings are marked unknown. The UI explicitly reports that shared expenditure/admission control across all execution nodes is **not connected yet**. This is observation foundation, not a release or token grant.
- Existing `/api/control/ai/v8/github` super-admin+`ai:read` authorization is preserved, with no new public endpoints.

## Security / activation boundaries
- No mutation service is exposed to an untrusted browser and no attempt is made to reuse the ChatGPT connector's installation ID as an EKODI-owned GitHub App.
- Actual shared API reservation requires a separate protected contract: authenticated server-side installation-token caller, atomic D1/Durable Object admission/idempotency and explicitly measured GitHub headers. Never turn on dispatch using inferred remaining quota.
- GitHub App HMAC secret, subscribed events and Cloudflare Worker configuration still require the owner's authorized setup. Merely having code deployed is **not proof of real event delivery**.
- New quota migration runs through existing isolated staging, protected production D1 backup and guarded Control API deployment workflow.
- Full exact-head CI, EKODI Orchestrator official recovery PR, protected merge, staging production deployment and browser/auth acceptance required before claiming live availability.

Test: `node --test test/github-api-budget-control.test.mjs test/github-operations-webhook.test.mjs test/control-github-operations.test.mjs`.

Background: Cloudflare D1 uses ordered prepared bindings and transactional batches; no non-atomic multi-statement quota reservations are presented as enforcement in this version. The two previously guarded changes have merged and their recorded production UI/Control API workflows succeeded: Site #40912096830, Control #40912100498.
