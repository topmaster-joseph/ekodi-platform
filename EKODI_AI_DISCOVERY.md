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
