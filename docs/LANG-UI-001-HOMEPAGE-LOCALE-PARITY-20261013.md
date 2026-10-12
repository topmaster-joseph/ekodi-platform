# LANG-UI-001 — Korean-only homepage publication parity (2026-10-13)

## Exact release provenance

- Source PR: #4422, owner-approved exact SHA `0101f7d305b73433efb97ba8f84a02e3dfb40944`.
- Owner Human Gate marker: https://github.com/topmaster-joseph/ekodi-platform/pull/4422#issuecomment-6128077257.
- Official EKODI D1 Orchestrator recovery task: `orch_recovery_0101f7d305b73433efb97ba8f84a02e3`.
- Official issue branch: `ai/chatgpt/orch_recovery_0101f7d305b73433efb97ba8f84a02e3`.
- Release integration PR: #4434. User-approved GitHub owner account opened the exact branch because the Actions token was denied PR-creation permission (HTTP 403), without broadening repository permissions.

## Production failure, verified

EKODI-owned Chromium run https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38275072571 observed source service `ekodi` published `["ko-KR"]`, hidden header selector correctly, but homepage actual document locale `en`, with English homepage copy. This is a genuine `document_locale_not_published` production mismatch. Journal passed the Korean-only control. SeonamMedi runs its own independent Korean header and is separately unverified as common Shell.

## Fix & verification boundaries

- `homepage-ambient.js` may only display languages authorized by the shared published-language Shell. Before readiness, render Korean, never a browser or cached unsupported language.
- Shared language event updates and async home presentation follow the same authoritative locale.
- Native Chromium assessor detects live document/homepage language mismatches as failures, even if the header selector is correctly hidden.
- The PR's real-production probe is **diagnostic** while the prior version is still deployed; scheduled/manual checks enforce real production failures after release.
- Source tests, native diagnostic and central CI passed on the approved commit.
- The released homepage script must be verified on actual `ekodi.kr/` *after* guarded Cloudflare production deployment. Synthetic checks and a source-branch pass do not certify production.

## Official convergence

This documentation-only owner-authored commit on the already issued `orch_` branch triggers EKODI `converge-orchestrated-pr-merge.yml` with unchanged release task receipt. The workflow owns protected-main synchronization, required fresh CI, conflict checking, guarded merge, and release dispatch. Do not bypass security, approvals or Cloudflare quotas. Track outstanding full multi-published-language positive proof in Issue #4365.

## Owner check regeneration after trusted protected-main synchronization

EKODI's official Convergent Merge run [#38276127067](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38276127067) returned `action:branch-updated`, synchronizing approved work to a newer protected `main` at `84102f02dc865b0402f0bc3000fef4fadd735469`. GitHub may classify checks on workflow-authored sync commits as `action_required`. This documentation-only owner-authored commit requests fresh required PR CI and repeats the official Orchestrator task verification without modifying locale behavior, overriding release checks, publishing any translation catalog, or fabricating production acceptance.
