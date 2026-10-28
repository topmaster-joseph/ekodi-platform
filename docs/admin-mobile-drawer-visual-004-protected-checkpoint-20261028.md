# EKODI ADMIN-MOBILE-DRAWER-VISUAL-004 — protected release checkpoint

## Authority, identity and scope
- User requested EKODI Orchestrator-managed continuation of the service engine catalog UI improvement.
- Source branch/PR: `ai/chatgpt/admin-mobile-drawer-visual-e2e-20261028` / #6545 at `35fccb0cd4e75019b15df3cc1856b0661ddaa151`.
- Official orchestrator recovery PR: #6547. Syncing `main` may change the official HEAD. Each new HEAD must pass **its own genuine required checks**.
- This checkpoint requests owner-authored CI on the synchronized exact HEAD; **not** a status substitute, merge approval, force-push or production deployment authorization.

## Confirmed production baseline
- Protected service engine CSS and accessibility enhancement #6521 merged; Social Hub visual changes #6520 merged.
- Shared Site Core run #40695180758: deploy succeeded; authenticated Admin E2E 49/49, including `engine-all` grid/stylesheet checks.
- Inspection of its artifact #12820625605, `menu-engine-all-mobile.png`, revealed the left sidebar still visually covering ~200px of the 390px viewport during responsive resize, although the CSS class/state-only gate reported success.
- This image is *not* accepted as final proof. The user-visible mobile screenshot remains the acceptance target.

## Corrective change
- `admin-conversation-workbench.css`: mobile closed drawer `visibility:hidden!important;pointer-events:none!important`; open state remains visible and interactive, retaining the native animated open transition.
- `scripts/verify-admin-production-ui-e2e.mjs`: after mobile resize, dismiss visible scrim, wait for real hidden/offscreen drawer, verify the first engine card occupies the viewport and receives `document.elementFromPoint` hit-testing before screenshot.
- `test/admin-conversation-workbench.test.mjs`: regression checks for the CSS/accessibility/hit-testing contract.
- No changes to authentication, authorization, DB/financial data, secrets or write APIs.

## Related-change integration review
- The parallel-change guard detected official cost-visual PR #6530 vs source #6545. #6530 independently updates `scripts/verify-admin-production-ui-e2e.mjs` for finance `infra-costs` heading/viewport bounds, plus `test/infra-cost-control.test.mjs` and its own checkpoint.
- #6547 updates the *same verifier file* only in the `engine-all` block; its CSS and regression test files are distinct. Preserve both E2E contracts.
- Recommended serial order for the sole EKODI Orchestrator: review and integrate #6530 first **only after authentic protected CI/overlap governance approval**; then synchronize #6547 with the new main, preserve both finance and service-engine sections and re-run all exact HEAD gates. If #6547 is selected first, #6530 must rebase/revalidate afterward.
- Other known related work referenced by #6530: #6433 domain E2E and #6448 security E2E. Review their merge order too. No integration labels were fabricated here.

## Acceptance gate
1. Exact-current-HEAD genuine CI, AI orchestration, overlap review, runtime contract, constitution/security checks all green.
2. Protected merge to main, staging and guarded site-core promotion.
3. Authenticated Admin production Chromium run: 49/49 (or current authoritative menu count), actual drawer offscreen/hidden, first engine card unobscured, verified mobile screenshot and no regressions to Social Hub/infra-costs.
4. Only then close the issue as delivered. Any `action_required`, cancelled or skipped check is not proof of success.
