# EKODI Search Visibility — native-only Google read-only UI release proof

Date: 2026-10-30 KST. Central issue [#6317](https://github.com/topmaster-joseph/ekodi-platform/issues/6317). EKODI Orchestrator is the sole release authority.

## Immutable origin and scope

- First-party Google Search Console read-only Control API source: official recovery [#6978](https://github.com/topmaster-joseph/ekodi-platform/pull/6978), protected merged SHA `c7f9f022c974b0f39c81bfb3cc8e4ef2be8ffbea`, Control API guarded deploy run [#40996288823](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/40996288823): validate, staging and production succeeded.
- Follow-up Site Core canary source [#7000](https://github.com/topmaster-joseph/ekodi-platform/pull/7000), superseded by bot-issued recovery [#7013](https://github.com/topmaster-joseph/ekodi-platform/pull/7013). Older interim recovery [#7012](https://github.com/topmaster-joseph/ekodi-platform/pull/7012) is DRAFT because its initial native Chromium test contained a malformed regular expression.
- The guarded Site Core manifest requires `data-sv-google-read`, `Google 실측 조회`, and `googleSiteUrl=` in the **actual** production Search Visibility asset, not just in the repository.
- The EKODI native Chromium-only production UI harness `scripts/verify-admin-production-ui-e2e.mjs` already invokes `scripts/verify-search-visibility-interactions.mjs` for the Search Visibility section at desktop and 390px mobile. The recovery extends that harness to intercept **only** the selected-site `GET /api/control/search-visibility?googleSiteUrl=...` and inject three non-sensitive *synthetic* Google response fixtures: disconnected, connected metrics, and missing rows. It verifies no real provider request or mutation; it must not be represented as authenticated live Google Search Console data.
- CI full test + CI Orchestration Contract for official recovery SHA `b129e33f072f07f9ceb90f545e4a55e42ba6c2ff` succeeded in run [#41005082684](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/41005082684). Parallel Change Conflict Guard succeeded on that head. This does **not** confer CI green status on later main-sync heads.

## Protected release checklist

1. Check exact current official PR #7013 HEAD against latest protected `main`; run fresh required `test`, `EKODI AI Orchestration Gate`, and conflict guard on the **exact** protected merge candidate. Keep blocked if workflows are `action_required` or missing.
2. EKODI Orchestrator alone issues and validates release receipt, handles Human Gate, and performs protected merge; never merge the obsolete interim PR #7012 or source PR #7000.
3. Execute guarded Site Core release with asset-first canary. Confirm actual served `/admin/search-visibility-admin.js` includes all new markers. Treat release failure as failure, not as a candidate pass.
4. Run EKODI-owned native Chromium PC and 390px mobile interaction checks, with synthetic UI-only admin session and intercepted Google GET, after guarded deploy. Do not use TinyFish, share browser cookies, user desktop control or external paid browser automation.
5. Verify anonymous `GET /api/control/search-visibility?googleSiteUrl=...` is still HTTP 403. Only a **separately owner-authorized** real super-admin session may verify a positive authenticated lookup. Search Console property permission and a Worker-managed `GOOGLE_SEARCH_SA_KEY_JSON` secret are necessary before any genuine metrics can exist.
6. Record distinct evidence for merged source, real CI, guarded production release, native browser UI, Google owner credentials and actual Google provider metrics. Never infer indexing success or AI search citation from technical readiness.

## Continuity

This documentation adds no runtime functionality, permissions, secrets, test bypass, DNS change, D1 mutation, paid provider, or background task. It records the post-main-sync exact-head revalidation requirement. Completion is **not** claimed by this document.

## Latest protected branch synchronization evidence

- The exact release candidate `15a930f3cf7e6b207efc733bef3e78aef13ffaec` passed authentic CI `test=success` (run #41005417151), Orchestration Gate (run #41005417002), and conflict guard. The Orchestration Gate log shows the official convergence dispatch occurred.
- Official convergence then synchronized other protected `main` changes, producing new recovery SHA `124475694e81341c5fc4cbb15b3cbaf5369b1ca5`. The bot-created workflow runs were `action_required` for that new SHA; earlier CI is not carried forward.
- This source-document-only follow-up requests fresh authentic CI for the updated merge candidate. It is **not** an authorization to bypass workflows or a Human Gate, and no production deployment is claimed.
