# EKODI Site AI signed heartbeat trust contract (candidate only)

Scope: owner-approved official EKODI Orchestrator task `orch_ca0ccbc9-c315-4e19-85bd-1d8fd60ab772`. Earlier verified slices: PR #9333 read-only advisory; PR #9377 fleet read model/UI; PR #9410 live authenticated E2E canary. Parent #9164 and #9329 remain open.

## This minimal module

`ekodi-site-ai-attestation.js` defines a deterministic, vendor-neutral heartbeat payload and Ed25519 signature verification. It only returns a **signed evidence candidate** when *all* conditions pass: validated immutable `workspaceId`, site/agent/key identity equality, authority-provided active registration, separately verified member and granting-person authority, scoped `site-ai:heartbeat` capability, valid lease, freshness, monotonically increasing sequence, unseen nonce and a genuine Ed25519 signature using a pinned server-side public key.

The source is Worker + Node WebCrypto compatible and uses zero model API calls, no MCP, no paid API, no specific PC/server/model. Domain-separated canonical signing forbids unexpected unsigned fields. Test suite checks wrong workspace/site, revoked role, stale/expired grants, tampering, replay, wrong key, unknown capability and zero automatic paid budget.

**Important: This is not an enrollment endpoint, a live Agent heartbeat or a site AI executor.** Even a valid signature result explicitly sets `siteAiLiveStatusEligible:false`, `executionAuthorized:false` and `productionMutationAuthorized:false`.

## Required future authenticated implementation (separate Human Gate because it creates new identity/security boundaries)

1. Register and verify site-agent key via an **actual authorized person + immutable workspace_id + role + capability** grant, not via URL/AI self-assertion. Public key records need revocation and rotation; no model or API key should be treated as the agent's sovereign identity.
2. Durable D1/Postgres registration/sequence table with scoped membership and TTL, atomic sequence/nonce compare-and-swap across Workers. Handle concurrent replay, 429, clock skew, lost connectivity and idempotent retries, with no new independent service where shared capability suffices.
3. Only after persisted replay/lease evidence may the read-only `site-ai/fleet` projection show `registered`, `fresh` or `stale`. Keep missing/invalid evidence **unverified**, and never show online from a task scheduler row.
4. Native site AI sees its own tasks/history/settings. Central overview sees summaries and links to original site admin. Executing a site change requires a separate task-scoped grant and EKODI Orchestrator preflight; a heartbeat signature NEVER gives mutation authority.
5. Actual owner approval and notification via EKODI inbox/Web Push, optional Kakao/SMS with separate consent and explicit cost coverage. Fresh human gate for permission expansion, destructive actions, contract/payment and physical actuation. Operator-controlled physical AI emergency stop remains independent.
6. Run independent real-host tests for authorized/denied/other-tenant, replay concurrency and key rotation, and guarded release before marking this capability production-ready.

The new module is deliberately pure and not routed to the internet; it creates no D1 schema, new credentials, endpoint, automatic provider calls or cross-tenant authority. The task cannot be marked fully complete based on this PR alone.
