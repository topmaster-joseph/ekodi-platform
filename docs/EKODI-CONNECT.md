# EKODI Connect

EKODI Connect is EKODI's own, provider-neutral connector core. It connects two ways:

- **Inbound** — external AIs (Claude, ChatGPT, any OAuth MCP client) connect to `https://ekodi.kr/mcp`.
- **Outbound** (P1–P2) — EKODI connects to external services (Google Drive, YouTube, …) through the "내 연결 관리" ledger.

The EKODI Orchestrator remains the only execution authority. An external AI receives the right to **submit and observe** work, never the right to execute or approve it.

## Module

`ekodi-connect.js` is the single source of truth, reused by:

| Consumer | Uses |
|---|---|
| `ekodi-mcp-gateway.js` | `resolveConnectClientClass`, `filterToolsForClient`, `isToolExposedToClient` |
| `mcp-client-policy.js` | `EKODI_CONNECT_CLIENT_CLASSES` (public fields only) |
| `scripts/verify-ekodi-connect-readiness.mjs` + production verify workflow | `probeConnectorReadiness` |
| Admin "내 연결 관리" (P1) | same registry and readiness report |

## Client classes and tool exposure

| Class | Tool profile | Notes |
|---|---|---|
| `chatgpt`, `openai-*`, `generic-mcp-oauth` | `full` | Only when the client id is explicitly bound |
| `claude-hosted` | `external-assistant` | claude.ai, Desktop, mobile, Cowork; callback `https://claude.ai/api/mcp/auth_callback` |
| `claude-code` | `external-assistant` | planned; loopback redirect on any port |
| `unregistered-mcp-oauth` | `external-assistant` | **default** for any client id not in the map (least privilege) |

`external-assistant` hides and refuses `approve_task`. Human Gate approval stays in the EKODI admin.

## Binding a client id

Client ids are public identifiers, not secrets. Bind them in `wrangler.api.toml`:

```toml
EKODI_MCP_CLIENT_CLASS_MAP = "{\"<oauth client uuid>\":\"claude-hosted\"}"
```

Only a UUID → known class pair is accepted; anything else is ignored.

## Adding a new AI provider

1. Add one row to `EKODI_CONNECT_CLIENT_CLASSES` (id, provider, kind, status, toolProfile, redirectUris).
2. Add a test in `test/ekodi-connect.test.mjs`.
3. After its first real connection, bind its client id in `EKODI_MCP_CLIENT_CLASS_MAP` only if it needs more than least privilege.

No gateway code change is required.

## Readiness check

```bash
node scripts/verify-ekodi-connect-readiness.mjs claude-hosted https://ekodi.kr/mcp
```

Critical checks (exit 1): unauthenticated 401, `resource_metadata` in the challenge, exact resource match, authorization server listed and reachable. Advisory checks: PKCE S256 advertised, a client identification path, refresh grant.

## Known state (2026-10-22)

- Supabase dynamic client registration is **on** in production, although `mcp-client-policy.js` declares `dynamicRegistrationDefault:false`. Turning it off is an account setting reserved for the platform owner. Until then, the least-privilege default above is the safety net.
- Five `MCP Inspector` test clients registered on 2026-10-01 to 2026-10-06 remain active and should be reviewed.
