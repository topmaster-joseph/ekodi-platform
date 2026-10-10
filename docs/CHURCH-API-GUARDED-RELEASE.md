# Church Pastor API: EKODI-owned guarded release

- Canonical public UI: `https://ekodi.kr/ekodichurch/`
- Existing admin: `/ekodichurch/admin/worship`
- Edge Function source: `supabase/functions/church-pastor-api/index.ts`
- Edge Function project: `renzehysxirjilvdxacv`
- Stage project: `lxcxwbdwwojjkgybbqii`
- Recovery origin PR: #4115, SHA `b11e8bcc00c97d126ed0aad53bf85f9d91c92840`
- Official Orchestrator task: `orch_recovery_b11e8bcc00c97d126ed0aad53bf85f9d`

The release path is only the official EKODI Orchestrator receipt -> protected CI -> protected merge -> `deploy-church-pastor-api.yml` dispatch -> staging dry auth proof -> production deploy and denial/CORS check. It is not an authorization for direct MCP-based production mutation.

This function already authenticates and authorizes through the central user identity and church tenant staff RPC. It retains the existing function-level verify_jwt=false setting because the function implements its own central bearer-token verification. This setting does not grant anonymous management access.

## Release evidence required
1. Required CI and orchestration checks on the **latest** PR head.
2. Official guarded workflow reports staging and production deploy success.
3. Live Supabase Function code contains `worship-access`, along with existing Church finance and permission boundaries.
4. Unauthenticated call to worship scope returns 401, foreign origin 403, authorized church operator positive test 200 and unauthorized finance-only/viewer 403 in a real authenticated EKODI-owned browser session.
5. No tenant personal data in the public Church homepage.

The Church Pages workflow and EKODI-owned native browser 9-language probes have already passed independently. Pending operator-positive proofs must be reported as outstanding, not silently marked complete.

## Latest protected-base synchronization

The official Orchestrator reconciled this PR with the current protected main branch. Required checks must be regenerated on the synchronized, owner-signed head and must all succeed before guarded merge or Supabase mutation. Source sha labels from the former head are not completion evidence.
