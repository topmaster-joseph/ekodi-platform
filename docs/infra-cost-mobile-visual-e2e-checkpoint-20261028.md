# EKODI-INFRA-COST-VISUAL-E2E-20261028 — protected validation checkpoint

## Authority and source
- User-requested follow-up for the Super Admin `/admin/finance/infra-costs` layout, tracked in issue #6363.
- Source PR #6529 recovered by EKODI Orchestrator into official protected PR #6530, task `orch_recovery_5eeed4fba2c845785c023e1dbb478535`.
- Source E2E and regression correction: exact commit `e0d5a0f12b81e2ae3a2886187070e4887ea9d84a`; source CI run #40701134565 passed. Central convergence then synchronized `main` into official branch and generated `e12907ed546ee327f3359f01c3ef49a0ca709a14`.
- This is a documentation-only checkpoint on that protected branch to request **fresh genuine exact-head PR checks** after the bot-authored synchronization was marked `action_required`. This doc is not a fake status, owner approval, release receipt or bypass.

## Already verified production baseline
- Protected #6434 merged, and #6526 mobile heading fix + #6528 site-core asset dispatch merged.
- Guarded Shared Site Core run #40695180758 deployed `c81b3dc8ba805d550c74d6c5bfbe1c4c09fd09f2`: deploy success, Admin Chromium 49/49, overall workflow success on failed-job retry attempt 2.
- Inspectable E2E artifact #12820625605 contains `infra-costs-desktop-verified.png` and `infra-costs-mobile-verified.png`: 500px mobile blank is removed, but mobile screenshot captures desktop sidebar during viewport transition. That screenshot is **not accepted** as final mobile visual proof.

## Current bounded test repair
- Native Chromium at 390px waits for `.sidebar` to be closed and its bounding right <=1px, then resets the workspace vertical scroll.
- Asserts finance panel left and right are within the viewport, heading block <=260px, heading-to-actions gap and actions-to-jump-nav gap <=36px, heading top in view; preserves no horizontal overflow, single-column cards and scrollable invoice table checks.
- Removes `scrollIntoViewIfNeeded()` which can cosmetically conceal geometry defects.
- Fixes existing static test to expect `INFRA_COST_MOBILE_VISUAL_E2E` instead of deleted `INFRA_COST_MOBILE_LAYOUT_E2E`.
- No billing API, financial write, Secret changes, public auth changes, or production payment actions.

## Release acceptance — no shortcut
1. Exact latest official PR commit required CI, architecture, conflict and Orchestrator checks green.
2. Review shared E2E overlap with #6433 (domain synthetic registry) and #6448 (security) and preserve their assertions; official Orchestrator alone grants integration order.
3. Protected merge to `main`, guarded staging and production Site Core release with exact SHA, evidence and rollback gate.
4. Post-promotion genuine isolated Chromium desktop + 390px screenshot **must** show finance heading and action controls with no sidebar overpaint or 500px gap. Verify invoice fixture search/filter/reset/editor without production DB write.
5. Record successful run, release commit and artifact screenshot in #6363 before declaring complete. Keep issue open otherwise.
