# Points synthetic member browser E2E — official EKODI release continuity
Date: 2026-11-03 (Asia/Seoul).

## Authentic task and release lineage
- User-approved EKODI points continuation, related Issue #7778.
- Worker task `points-staging-e2e-tabs-20261103`, PR #7952, exact functional commit `9a9e705c1b0d1802ecc3b0292bb97b218b5f01b4`.
- Official orchestrator recovery PR #7954, branch `ai/chatgpt/orch_recovery_9a9e705c1b0d1802ecc3b0292bb97b21`.
- This non-runtime documentation commit on that **existing orchestrator branch** is an owner-connected request for authentic latest-head required checks. Worker PR is closed unmerged; never merge it directly.
- The original worker head passed real CI, Supabase Local CI, EKODI AI Orchestration Gate and My EKODI deploy validation; these results do not stand in for authentic checks after main synchronization.

## Correctness and staging acceptance
- Previous browser E2E waited for a claim pane hidden by four-tab CSS, yielding a false failure. The script now selects the actual visible tabs and checks verified weekly/goal panels before claiming.
- Member desktop and mobile synthetic E2E must submit a server-verified evidence claim, observe pending in the claim history, switch to mission tab, and wait for the real server-refreshed `승인 대기` row. Both claim and mission screenshots are retained in the development-only artifact.
- The member frontend now fetches the latest read-only `/progress` after successful claim submission, preserving canonical Person/site and request-revision isolation; it does not award points in the browser.
- DEVELOPMENT Supabase `points-api` version 6 is ACTIVE (JWT-verified) and includes weekly projection; a canonical-Person private goals migration was applied to development only. Isolated DB smoke passed; anonymous RPC execution and direct authenticated table SELECT are denied. Production Supabase has not been mutated.
- The browser workflow remains `workflow_dispatch`, development-only, Cloudflare Access service-token protected, with ephemeral test identities and unconditional cleanup; no production secrets or deployment permission changed.

## Required guarded gates
1. Current-main integrated official recovery head receives authentic required checks, receipt verification and guarded merge. Bot-generated `action_required` statuses do not count.
2. Official My EKODI deployment lane confirms the exact release and rollback receipt.
3. Authorized DEVELOPMENT browser E2E runs with temporary identity, site, claimed evidence, screenshots and final cleanup. No bypass of Cloudflare Access or staging environment boundary.
4. Canonical production `https://ekodi.kr/my/points/` browser evidence checks four tabs and fail-closed public state. Production points remain `POINTS_ENABLED=false` until production point backend/site/operator policy, financial/legal gates and real member E2E are verified.
5. Never report economic points, transfers, donations or 90-day recognition as active merely because an E2E test or PR passed.

This file does not issue release authority or authorize a direct merge, elevated production data change, new account privileges or overriding EKODI Orchestrator.
