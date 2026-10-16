# SeonamMedi Citizen Voices V2 — non-destructive rollout checklist

**Status: blocked pending CI, authenticated staging and independently verified rollback.**
Source PR #5094. The V2 files in `services/independent-board/v2/` are **not deployed** or routed to citizens.

## Ownership and preservation

- The canonical database is the existing dedicated Cloudflare D1 `ekodi-independent-board` (`BOARD_DB`); media uses R2 `BOARD_FILES`. Do not delete, truncate, rename or duplicate production records.
- Reuse the existing `/board/api/*` API and server-authorized `/board/api/admin/*`. V2 is a parallel UI/client implementation, not a new database or a new writer.
- Never copy private contacts into public snapshots, test fixtures or CI artifacts. Test only with synthetic messages and accounts.
- Keep both `https://seonammedi.kr/board/voices` and `https://ekodi.kr/seonammedi/board/voices` stable. Retain existing routes until post-cutover validation.

## Preconditions — **do not check off without evidence**

1. PR head and all required tests pass (including exact SHA and gate provenance). Record the workflow run IDs; a queued job is not a pass.
2. Operator verifies production D1/R2 bindings by authorized control plane. Capture protected inventory and row counts for `board_posts`, `board_replies`, `board_notices`, finance tables, file object counts.
3. Take provider-supported D1 backup/Time Travel bookmark and R2 backup/version recovery reference in protected records. Verify restoration in **isolated staging** and compare counts and attachment availability. Never restore over production.
4. Stage V2 on a separate preview host or route with `noindex`, without changing production routing. Exercise Google one-time return and refresh on actual browsers.
5. Exercise unauthenticated public read, authenticated compose after Google chooser, queue submission -> **published ID** -> public read, repeated login prevention, forbidden regular-user admin access, authorized admin edit/delete, media, PC/mobile and both hostnames.
6. Verify server admin edit preserves original name, private contact, category and status; do not inspect or expose private details in public UI.
7. Independently verify the exact protected deploy workflow, orchestrator approval, branch provenance, rollback and service-owner sign-off.

## Cutover and rollback

- Use an explicitly authorized feature flag or route-based canary; default remains legacy. **No direct main merges or production Cloudflare deploys from the V2 source PR.**
- Canary on both domains with live synthetic records. Retain old client route and monitor server-side 401, 403, 429, 5xx, queue publish confirmations and write latency.
- Rollback by restoring the legacy routing/client **without rolling back shared D1 writes**. Any records created during the canary belong to the canonical database and must persist.
- Only retire the legacy UI after a passed observation window and data integrity review. Never delete the old DB, real posts or media as part of this UI change.

## Current known limitations

- Static preview is not connected to worker routing or protected staging. Browser-to-API integration requires deployable static assets under a preview origin with same-origin API routing.
- Authentication exchange must be verified with real Google accounts and a dedicated authorized test user. Unit tests do not prove live identity handoff.
- Automated D1 backup/restore evidence and R2 asset integrity have not been obtained. A declaration-only inventory is insufficient.
