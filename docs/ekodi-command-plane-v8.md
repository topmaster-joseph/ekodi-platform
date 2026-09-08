# EKODI v8 Command Plane

EKODI v8 treats AI providers as replaceable specialist compute under EKODI-owned identity, policy, authorization, routing, audit, and verification.

## Runtime flow

`Pulse → Command Plan → parallel specialists → Sentinel → evidence → close/degrade/human gate`

- Pulse accepts schedule, webhook, repository, monitor, service-health, and system events.
- Standing delegation is required before an event may start work without another user prompt.
- High/critical risk and red change classes stop at a human gate.
- Specialist roles prefer distinct providers and run in parallel.
- Sentinel receives specialist evidence only after specialist execution and independently challenges completion.
- Actual provider diversity and degraded state are returned as evidence.
- `AI_PROVIDER=NONE` keeps the Command Plane Core-only and prevents provider invocation.

## URL migration safety

The Command Plane does not treat `my.ekodi.kr`, `admin.ekodi.kr`, or any other user-facing hostname as identity or authority. It targets symbolic resources:

- `workspaceId`
- `workspaceSlug`
- `service`
- `capability`
- `surface`

Canonical URL resolution remains the responsibility of EKODI routing governance and runtime adapters. This lets the `ekodi.kr/my` and `ekodi.kr/admin` migration proceed independently of AI orchestration.

## Current provider collaboration

When the guarded multi-provider pool is enabled and server-side credentials are available, the current registry can expose OpenAI, Anthropic, and Gemini. A typical three-provider command plan reserves two providers for parallel specialist roles and a third provider for Sentinel verification.

Provider output never grants new EKODI authority. System mutations remain behind existing mission governance, authorization, release, and human-decision gates.
