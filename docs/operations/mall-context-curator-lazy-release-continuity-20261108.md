# EKODI Mall — noncritical affiliate recommendations lazy-load release continuity

Date: 2026-11-08 (Asia/Seoul)
Parent performance issue: #8469
EKODI AI work intent: #9025
Source task: `perf-mall-context-lazy-affiliate-20261108-01`
Source development PR: #9027 (closed as superseded, never merge directly)
Immutable source commit: `e3a5749d1f5eace522c0c47f832e5db0cce735d2`
Official EKODI Orchestrator release PR: #9028
Orchestrator task: `orch_recovery_e3a5749d1f5eace522c0c47f832e5db0`
Official branch: `ai/chatgpt/orch_recovery_e3a5749d1f5eace522c0c47f832e5db0`

## Why this owner-connected continuation exists

EKODI Orchestrator generated the official recovery PR, but its bot-origin pull_request Actions checks returned `action_required`, not authentic required checks; central convergence reported `authentic_required_checks_not_green`. This documentation-only, owner-connected update on the **already-issued official release branch** requests fresh authenticated CI and invokes the repository's existing protected orchestrated convergence on push, following the documented notification/points recovery precedent.

This note creates **no** source modification, approval, AI/production authority, status, fake release receipt, workflow exception, branch protection override, direct merge, or production deployment. The original exact functional source must remain in the branch's ancestry. Only real latest-head authentic CI, protected EKODI merge, isolated Mall staging, guarded production and independent live verification can settle the task.

## Scope of the reversible source change

The public Mall homepage used to initiate the 80-item affiliate recommendation feed immediately from `sites/ekodi-mall/assets/context-curator.js`, even while its `#recommend` section was below the viewport. With source #9027, its read-only request starts only when the panel enters 320px viewport margin, the recommendation form is focused/used, or a recommendation deep link is opened. Non-IntersectionObserver browsers preserve eager fallback; concurrent user requests share the same fetch and user choices must not be replaced by a late default render.

Modified source: `sites/ekodi-mall/assets/context-curator.js`; new regression: `sites/ekodi-mall/test/context-curator-lazy.test.mjs`; Mall doctor includes the test via `sites/ekodi-mall/package.json`. No auth, tenant, checkout, seller approval, prices, payment, API, D1, quota, or provider credentials are changed. Reversal: revert the small source change only, through the same guarded pipeline.

## Authentic evidence and required final acceptance

The owner-originated original development PR head passed full CI (run `42475448389`, job `128715628942`), including full build, repository tests, provenance contract and recovery trigger. Original tests/required checks are **not** proof for a later bot-synchronized recovery head. Wait for new authentic checks on the actual official head: constitution, orchestration, security, overlap, Mall `npm run doctor`, and applicable stage/deploy gates.

After an authorized EKODI release, use its independent Mall browser worker to verify the actual `https://ekodi.kr/ekodimall/` PC/mobile homepage does **not** issue affiliate recommendation feed before approaching `#recommend`; ensure a single feed request after scroll/direct `#recommend` or form recommendation; verify card details, images, disclosure, catalog filters and checkout scope unchanged. Respect CF-QUOTA-001 and no-store for private/transactional data. Do not claim production speedup, LCP/INP/CLS improvement, all-site result, or completion without current authoritative release receipt and real-device/real-browser evidence. 

This file is an operational continuity note, not a release authorization or proof of deployment.
