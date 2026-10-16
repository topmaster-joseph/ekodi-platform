# LANG-UI-001 — guarded homepage post-merge dispatch

## Authorized release lane
- Original source PR #4446 approved exact SHA `e48be29ea4fd1579bdbf0ae140c0519011dd350f`.
- Owner approval: https://github.com/topmaster-joseph/ekodi-platform/pull/4446#issuecomment-6128441130.
- Official D1-backed EKODI task: `orch_recovery_e48be29ea4fd1579bdbf0ae140c05190`.
- Official integration PR #4447 on `ai/chatgpt/orch_recovery_e48be29ea4fd1579bdbf0ae140c05190`; source #4446 closed unmerged.
- Trusted recovery branch originated at the exact approved SHA. GitHub Actions token could not create PR (HTTP 403); repository owner GitHub connector opened the same issued branch without changing application code or branch permissions.

## Reproduction and root cause
- EKODI-native Chromium run #38276752123 confirmed `/api/i18n/v1/status?service=ekodi` published Korean only, while the live homepage text and `document.lang` remained English.
- Homepage language renderer source fix was protected-merged in PR #4434, commit `1c900ed4d2d74ed129dc1bc82d5907f42c8e5ab0`.
- Because GitHub GITHUB_TOKEN merges do not fire `main` push workflows, the official convergence dispatcher must explicitly map changed homepage assets into `sharedSiteTouched`. Previously the dispatcher omitted these files, which can leave production serving stale home content after a successful protected merge.

## Narrow guarded release fix
- `index.html`, `homepage-ambient.js` and `homepage-ambient.css` are owned by EKODI Shared Site Core.
- This PR adds those files to `sharedSiteTouched` so merge invokes receipt-bound `deploy-site-core.yml` through the official Orchestrator.
- Tests require both the manual protected release dispatch and existing direct `main` push fallback.
- The dispatcher source itself is already an allowlisted Site Core release trigger, so this guarded deployment rebuilds the current main source with the previously merged homepage fix.

## Completion
Do not mark resolved until Cloudflare production Site Core confirms new release and a post-deploy EKODI-native Chromium session observes root document and content locale as `ko-KR` when real API `publishedLocales` is Korean only. Journal must remain correct. SeonamMedi independent header and genuinely published multi-language positive acceptance remain separately tracked in #4365.

This evidence-only owner-authored commit activates the official `converge-orchestrated-pr-merge.yml` on an EKODI-issued branch. No security policy, authorization, Cloudflare quota, or publication gate is bypassed.

## Owner CI revalidation after protected-main synchronization

EKODI Convergent Merge run [#38278592733](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38278592733) returned `action:branch-updated` after validating official task provenance, synchronizing integration candidate to protected main at `6eaea9047135d06d99f7240026268e61eab14560`. GitHub can classify GitHub Actions-authored synchronization commits as `action_required` rather than passing required CI.

This repository owner-authored **documentation-only** change starts fresh protected CI on the synchronized tree and does not weaken branch protection, force Cloudflare deployment, expand homepage translations, or modify runtime behavior beyond the exact source repair. Retain the original exact-SHA Human Gate and issue #4365's independent live acceptance.

## Second owner CI revalidation after protected-main and duplicate review

Official EKODI Convergent Merge [run #38278829341](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38278829341) synchronized branch to `9480535ef6a02c09b4adb73fab977e71b5f4c98b`. Bot-authored synchronization checks were marked `action_required`; only a fresh authorized owner-authored source commit plus passing protected CI qualifies for merging.

A second source PR #4448 independently addressed the **same** homepage Site Core dispatch omission. Cross-reviewed matching source, test and release scope in comments on both PRs; later PR #4448 is **closed unmerged** so only the already issued and owner-approved #4447 can dispatch production. This is conflict prevention, not an exemption from the guard.

This append-only release evidence change starts fresh GitHub protected CI on the synchronized tree, preserving the same EKODI D1 task, human authorization, Cloudflare quota checks, and actual post-production Chromium acceptance requirement.
