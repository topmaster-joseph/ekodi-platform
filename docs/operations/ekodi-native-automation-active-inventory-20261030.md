# EKODI native automation active-task inventory update — 2026-10-30

Canonical owner: **EKODI Orchestrator**. Tracking: #6895. This is an observational inventory, not a scheduler or proof of replacement.

The actual connected ChatGPT Automations list was checked on 2026-10-30 and contained **five enabled recurring tasks**, not the earlier reported four. The fifth is `에코디선교회 홈 실증 완료 추적`, which tracks EKODI issue #6875. Other four: social account release watch, Church Live release watch, Human Publishing monthly production and Church weekly worship content preparation.

The native EKODI `EKODI Native Operations Watch` previously assessed four tasks; its `scripts/ekodi-native-migration-status.mjs` now includes a fifth read-only task `mission-home-production-e2e` with mandatory evidence:
- Approved public Mission photos with consent and graceful media fallback, no invented activity images;
- Protected Space source SHA and release receipts;
- Actual first-party Chromium desktop 1440×900 and mobile 390×844 E2E;
- Live mobile production readback and absence of image errors;
- Exclusivity and a separately verified ChatGPT task-disable receipt if ever cut over.

A successful GitHub workflow or issue update is **not** proof that any of those UI checks happened. This reporting change does not add a Cron, call OpenAI APIs, create a task, or disable any existing ChatGPT automation. Additional active tasks must be discovered by future authorized inventory reconciliation rather than assuming a fixed 4-task universe.

Integration constraint: #6890 (native schedule) still requires official checks; #6920 (cutover guard) and #6934 (operations watch) already merged. The separate Church Google Docs/Slides draft-writer PR #7002 is not a migration completion receipt.
