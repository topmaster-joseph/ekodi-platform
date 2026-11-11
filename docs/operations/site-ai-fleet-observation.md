# EKODI Site AI fleet observation (phase 2)

Parent authenticated EKODI Orchestrator task `orch_ca0ccbc9-c315-4e19-85bd-1d8fd60ab772`. First merged slice: #9333. This is a separate isolated **phase-2 branch** for the same approved overall intent; neither the parent task nor the distributed AI ecosystem is marked complete by this change.

## Reuse-first implementation

- `ekodi-site-ai-fleet-readonly.js` reads existing `config/site-lifecycle-registry.json` and `ekodi_site_improvement_runs` in D1, with a bounded **SELECT**. This is an operational ledger, not site AI registration.
- `GET /api/control/ai/v8/site-ai/fleet` returns a **Super Admin + ai:read** read-only summary, via existing `ai-command-control.js` session/auth. No public endpoint or tenant-grant escalation.
- EKODI Control → **Agents** shows site names, **AI 가동 미검증**, last site-improvement ledger state when available and a **자세히** link to the **native** site admin screen. URL is derived only from verified first-party registry paths; the browser builds DOM via `textContent`, not server HTML.
- If the D1 table is unavailable, report `ledgerAvailable:false`. Never show fake zeros as actual agent coverage, infer an AI assignment from a site registry entry, infer production verification from a scheduler row, or claim live agents based on a cached label.

## Expected next capability

An authenticated, durable site-agent registration/heartbeat/report contract with immutable `workspace_id` and person-role-capability grants, freshness window, evidence provenance, signed/verified runtime identity, and full tenant isolation. Only then can the overview distinguish verified live AI, stale, interrupted, or blocked. This future write path requires a separate design/security review and an EKODI Orchestrator gated PR. Native site administrators own the site detail and mutations; central view remains summary only.

## Acceptance evidence

- Node unit tests deny noncanonical/unknown site routes and fake live claims; DB errors do not leak details; SQL never writes.
- API rejects unauthenticated or wrong-role access. HTTP method must be GET. Audit native detail links for exact site/workspace auth.
- Test mobile and desktop Agents layout, authenticated API 200 response, unauthenticated 401 and wrong-role 403 at real production host after both **Control API** and **Site Core** guarded release lanes; do not infer live deployed from PR merge.
- User's cost policy remains KRW 0 automatic paid API budget; no MCP or external paid API needed.

This is an interim **observability** feature, not an implementation of autonomous site AI operation, actual notification dispatch or model self-improvement.
