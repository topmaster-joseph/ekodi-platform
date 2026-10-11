# Church native browser diagnostics

This release integrates only first-party EKODI Chromium diagnostics.

- Existing native worker: `scripts/ekodi-background-browser-worker.mjs`.
- New diagnostic: `scripts/ekodi-church-native-locale-diagnosis.mjs`.
- Event: PR or explicit `church_locale_diagnostic=true` request. Other release workflows do not require all nine languages.
- Evidence: background-browser-worker artifact `church-locales/diagnosis.json`.
- Tested live nine locales twice: #38095488414 and #38095794953; both passed initial and settled DOM checks. Public page errors: 0; guest admin control hidden.
- Distinct backend warning: Church partner news `/api/partner-news/public` produced HTTP 404 and occasionally 429. Tracked separately in `topmaster-joseph/ekodi-church#104`.
- Full browser evidence cannot substitute for authenticated operator rights or Edge Function deployment; follow up in platform issue #4092.
- EKODI official Orchestrator release receipt: `orch_recovery_185f1a7328233c9c41d0847a75e262ae`.

Any future failure must be captured rather than bypassed, and no external browser provider is required to run this task.

## Post-convergence protected checks

After EKODI Convergent Merge synchronized this candidate with protected main, the resulting bot-authored commit required owner-triggered checks. The current owner-authored record requests full required CI and first-party browser worker verification on the synchronized source, without changing its runtime scope.

## GitHub protected-base refresh (second attempt)

An additional concurrent main integration produced a new bot-authored synchronization commit. This owner-authored follow-up requires the complete first-party CI and Chromium run again on the latest branch head; stale approvals and merge statuses are not reused.
