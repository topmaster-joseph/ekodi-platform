# EKODI Church contextual worship management — integration contract

The Church public website is owned by `topmaster-joseph/ekodi-church`. The EKODI Core owns the authoritative Church staff and tenant authorization contracts. These remain independent deployment units.

## Scope

- A read-only `GET /functions/v1/church-pastor-api?scope=worship-access` capability projection.
- Central authenticated user identity and existing church-staff server role, or RLS-scoped proof of the church-specific `site_access_registry` tenant administrator.
- Response only contains `ok`, `permissions.worship` and the fixed Church site identifier, with `Cache-Control: no-store`.
- The separate Church page shows a hidden-by-default management link after the role check succeeds. Existing `/ekodichurch/admin/worship` remains the real management surface.
- No exposed donor, member, attendance, or finance data. No new mutation API or elevated permissions.

## Rollout order and verification

1. Protected EKODI Orchestrator CI, review and merge for Core capability.
2. Deploy the updated `church-pastor-api` Edge Function using an authorized guarded Supabase release with recorded source SHA and audit evidence. **A GitHub merge alone does not deploy this Edge Function.**
3. Publish `topmaster-joseph/ekodi-church` source PR #101 through the guarded Cloudflare Pages workflow and verify the actual `ekodi.kr/ekodichurch` routes serve the file.
4. Confirm guest endpoint -> 401; church viewer/finance-only operator -> 403; scoped church worship administrator -> 200. Verify the on-page link appears only to those allowed, survives refresh, and disappears on logout or membership revocation.
5. Verify desktop/mobile public worship pages, older admin fallback, and no routing regressions.

If credentials, guarded deployment or authenticated browser access are unavailable, leave this release unverified. Never report production completion from static tests or merge status alone.
