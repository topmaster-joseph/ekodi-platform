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

## Second protected-main synchronization and related work review

The official Convergent Merge [#38276876749](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38276876749) synchronized to newer protected `main`, resulting in trusted workflow-authored branch head `68d385d0bbb49d3c7e06acd89a77cc1ac031bd7d`. This owner-authored documentation-only follow-up requests **fresh CI on that synchronized source** and retains the existing exact-source Human Gate/Orchestrator receipt.

The parallel-change guard found overlapping work in PR #4438. A verified GitHub state check showed #4438 **closed, not merged**; it targeted the same LANG-UI-001 homepage parity fix. Detailed `[EKODI RELATED CHANGE REVIEW]` evidence is recorded in a comment on #4434. Avoid double merging, and re-evaluate if an overlapping PR reopens. This note does not waive any conflict guard, release authorization, Cloudflare quota, or post-deploy production check.

## Third protected-main synchronization and duplicate PR closure

Trusted Orchestrator convergence [#38277433202](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38277433202) returned `action:branch-updated` and synchronized branch head to `2372d5f1fef1635c787ff46e2a26b1edbac99527`. Two other overlapping PRs (#4438 and #4439) were examined. Both are **closed without merge**. In particular #4439 differs only by slightly stronger independent HTML/document locale checks; its homepage implementation and workflow are identical to this authorized source. No competing PR is to be double-merged.

This owner-authored evidence-only follow-up triggers fresh required GitHub checks after the trusted base update. It neither waives EKODI's conflict guard or exact-source Human Gate nor claims production success.
