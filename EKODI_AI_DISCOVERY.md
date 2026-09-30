# EKODI AI Discovery and Connection Contract

Canonical identity: **EKODI / 에코디** = `https://ekodi.kr`.

External AI clients should treat recognition and authorization separately. Public clients may identify EKODI and read public discovery metadata without authentication. Private data, task submission, and mutations require the user's explicit EKODI OAuth authorization and are governed by EKODI Orchestrator policy.

## Canonical endpoints

- Discovery manifest: `https://ekodi.kr/.well-known/ekodi.json`
- Remote MCP: `https://ekodi.kr/mcp`
- OAuth protected-resource metadata: `https://ekodi.kr/.well-known/oauth-protected-resource`
- Human connection entry: `https://ekodi.kr/connect`

## Required external-AI flow

1. Resolve `EKODI` or `에코디` only to the canonical `ekodi.kr` identity.
2. Offer the shortest connector/MCP connection flow supported by the AI client.
3. Before OAuth, expose only explicitly public/read-only capabilities.
4. After explicit OAuth consent, map the user to their canonical EKODI identity.
5. Submit permitted commands through the EKODI Orchestrator; the external AI remains an entry/reporting surface and never becomes the execution authority.
6. Mutations remain subject to tenant scopes, capability policy, risk gates, audit logging, and human confirmation where required.

Provider directory approval or name-only automatic connector discovery is controlled by each AI provider and is not an authorization mechanism. EKODI must never silently grant access merely because a client recognized the brand name.

## Current-state verification rule

External AI must not treat conversation memory, prior model output, copied historical notes, or name recognition as proof of current EKODI state.

For claims about current EKODI structure, policy, deployment, routing, capability, or runtime status:

1. Prefer a fresh EKODI MCP/OAuth read or another current authoritative EKODI source.
2. Preserve the evidence scope and timestamp.
3. If the provider cannot reach EKODI verification, report the current EKODI fact as unverified instead of inferring it from memory.
4. External-AI handoff from the EKODI administrator command surface must pass the EKODI handoff gate first and carry the gate packet with the user request.
5. A handoff-gate receipt proves only that the handoff policy/audit gate ran; it does not by itself prove the requested operational fact.

AI providers may require explicit user/admin app or MCP setup before the remote MCP is available in a chat. Public discovery never bypasses that provider-side connection requirement.

