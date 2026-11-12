# My EKODI guarded production release — stale dispatch prevention, official recovery

Date: 2026-11-12 (Asia/Seoul)
Authoring source PR #9422; exact functional SHA `535276bb28f13c2994669a4a9f5f88b497401b9e`.
Official EKODI Orchestrator recovery PR #9423, branch `ai/chatgpt/orch_recovery_535276bb28f13c2994669a4a9f5f88b4`.
No direct merge authority, no production activation authority.

## Proven mismatch
Points owner-binding source PR #9376 merged to protected main commit `8e22145c24fa2c67d511ad2060ebfb975f759f1c`. The post-merge My production workflow run [43122740018](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43122740018) was dispatched immediately after the merge but kept the previous workflow event SHA `15fbddf8221a283205a8fd64e8950a9b629fc46d`; it deployed candidate `6720013c-b9ba-403d-99ed-48b7f06fdf33` and promoted it at 100% using old source/manifest checks. Live public read-only fetch of canonical and workers.dev Points app.js with the v2 version query still returned JS missing `isCurrentHistoryOwner(snapshot,session)`, despite merged main having it. The old `GITHUB_SHA` also received a misleading My production success status.

## Safety repair and validation
The isolated #9422 functional source changes only `.github/workflows/deploy-my.yml` and `test/my-production-validated-sha-gate.test.mjs`. It reuses protected GitHub Actions and current-main validation, pins production to exactly the validated SHA, requires remote protected-main equality before any production schema operation and before Cloudflare candidate promotion, and publishes status on the validated source SHA. There are no new broad permissions or secrets, no points economy or database changes.

Authenticated source full CI [43144442483](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43144442483) passed, My staging validation [43144442509](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43144442509) passed, and Security, Constitution, Conflict Guard, Cloudflare Boundary Audit, Supabase Local CI and Orchestrator Gate were successful for source SHA. **This documentation-only commit does not constitute official-head CI.**

## Why this checkpoint is needed
The first-party orchestrator issued #9423 using the GitHub Actions token, and the synthetic GitHub PR test runs marked `action_required`. This owner-connected, non-executable documentation commit requests genuinely executed protected GitHub CI and the built-in convergence workflow on the *official recovery branch*, keeping exact original source ancestry and all security gates intact. If `main` advanced through workflow-file changes, the existing policy requires **owner-authored sync** because the bot token may not update workflow files. Never force-push, self-merge, relabel approval, forge success statuses, or bypass the branch protection to resolve the gate.

## Required completion proof
1. Latest official recovery HEAD authentic CI, AI Orchestration Gate, zero subdomain, Cloudflare, security and conflict checks pass.
2. Converged latest protected-main ancestry and matched EKODI release provenance are checked before orchestrated merge.
3. New guarded My production dispatch must validate a protected current-main checkout (never pre-merge event SHA), and its actual candidate/prod canary must find the served JS `function isCurrentHistoryOwner(snapshot,session)`, owner ID equality and HTML `20261112-csv-owner-binding-v2` cache reference.
4. Confirm 100% Cloudflare promotion and report status on validated source commit. If main advanced, safely fail and reissue a fresh approved deployment rather than accepting a stale success.
5. The Points economy remains `POINTS_ENABLED=false` with production schema/function absent; manual encrypted backup, independent restore, separate owner/security/finance review and development-only signed-in synthetic CSV E2E remain open gates.

This note creates no backup, SQL mutation, worker deployment, economic award, entitlement, email, or third-party charge.
