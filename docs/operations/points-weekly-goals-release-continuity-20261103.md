# EKODI Points weekly recognition goals — protected release continuity

Date: 2026-11-03 (Asia/Seoul)

## Source and authority
- User-authorized scope: continue EKODI Activity Points under the existing EKODI Orchestrator.
- Worker PR #7866, exact functional source `37a5d9d1b21420f071c1276dfeab14c467e59416`. The worker PR was closed, not directly merged.
- First-party EKODI release recovery PR #7867, official branch `ai/chatgpt/orch_recovery_37a5d9d1b21420f071c1276dfeab14c4`.
- The official recovery branch preserves the original functional SHA as a Git ancestor. This file is non-executable documentation only, written on that exact recovery branch.

## Why a fresh authenticated run is requested
EKODI's recovery branch was generated with a GitHub Actions token and registered `authentic_required_checks_not_green` (bot-origin checks can show `action_required`). The repository documents owner-connected, non-runtime updates to the official branch to request authentic required checks, without bypassing the central orchestration gate (see `docs/operations/points-member-progress-release-continuity-20261103.md`). 
This commit **does not** forge checks, issue a release receipt, merge, change role authority, weaken branch protection, deploy production, or activate a site. Only the official EKODI convergence path may promote after latest-main synchronization and authentic CI success.

## Implemented non-financial features
1. Verified KST Monday–Sunday approved activity count, pending count and distinct active days; never treat page views, self-reported devotion or worship attendance as recognition evidence.
2. Voluntary weekly target (1–7 days) and 90-day approved-activity target (3–90), with explicit Save/Reset.
3. User goal preferences in a private schema keyed by canonical Person + enabled site. Anonymous RPC calls denied, authenticated calls resolve Person server-side; no direct browser table access.
4. Unit/UI and throwaway SQL tests; direct development PostgreSQL BEGIN/ROLLBACK smoke returned POINT_RECOGNITION_GOALS_SMOKE_PASS and table rollback was independently confirmed. No production DB mutation.
5. On a runtime with older functions or pending migrations, the user goals panel hides rather than offering a nonfunctional save, and the weekly panel hides when the API lacks the week projection.

## Required post-merge acceptance
- All checks on the latest current-main-integrated recovery head pass as authenticated GitHub Actions checks, including CI, isolated Supabase SQL smoke, constitutional and security gates.
- Central EKODI Orchestrator receipt, guarded release, and release/rollback traces exist.
- Production `https://ekodi.kr/my/points/` shows accessible tabs and does not promise point earning while `POINTS_ENABLED=false`. Validate desktop/mobile and no leaked prior-site data.
- Development-only function/version/schema readiness and a synthetic authenticated member flow must be verified before a future authorized policy activation. Staging currently requires Cloudflare Access and must not be bypassed.
- Conversion, donation, monetary value and paid member rights remain behind separately reviewed budget/legal/owner gates, with their existing defaults unchanged.
- A code/CI/merged PR is not proof of operating service completion; only verified live behavior and recorded receipts allow a scoped completion claim.
