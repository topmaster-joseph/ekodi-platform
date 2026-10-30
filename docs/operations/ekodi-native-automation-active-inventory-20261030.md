# EKODI native automation task handoff snapshot — 2026-10-30 19:08 KST

Owner: EKODI Orchestrator. Central issue: #6895.

**Only an imported operator-verified ChatGPT Automations snapshot.** EKODI native
Workers and GitHub Actions do NOT have a trusted live interface for reading
ChatGPT scheduled-task state. Never treat this text as real-time evidence or
permission to disable a task. A future EKODI ownership registry must keep
signed/auditable per-workload cutover receipts and re-check current schedules
before retiring any legacy job.

## Five enabled on latest authoritative observation

1. Church Naver ownership and Cloudflare recovery monitoring:
   `에코디교회 네이버 운영 실증 복구`. Official release dependency PR #7036
   was merged, but final Naver ownership/indexing success, sitemap, current
   production source and mobile E2E are separate verification claims.
2. Social-account page release and real UI check.
3. EKODI Human Publishing monthly manuscripts, approved EPUB/audiobook,
   rights and release workflow.
4. EKODI Church Live broadcast release and logged-in studio/public-viewer E2E.
5. EKODI Church weekly sermon Google Doc, bulletin Google Doc, worship
   Google Slides with human pastor/owner authorization.

The prior `에코디선교회 홈 실증 완료 추적` task was **not enabled** in
this latest observation. It remains an important independent Mission
site-quality concern, issue #6875, but must NOT be represented as an active
ChatGPT task or included in the five-task cutover count.

The import is represented by `LEGACY_TASK_SNAPSHOT` in
`scripts/ekodi-native-migration-status.mjs`. This is a deliberately
fail-closed read-only report. It supplies no new Cron, ChatGPT automation,
browser credentials, public content, account authorization or task-stop power.

## Native cutover gate remains separate

- The native scheduler PR #6890 is not merged; existing EKODI
  `ekodi-native-operations-watch.yml` already runs and records read-only
  evidence but does not create documents or books.
- The native admission guard #6920 and existing operations watch additions
  #6934 were merged. #6988 also prepared approved Scripture and six monthly
  editorial slots. Their *read-only* evidence is not publication.
- The offline EPUB draft builder #7015 is merged but it does not generate
  original prose, confirm rights, release books or replace the existing monthly
  publishing task.
- The Google Docs and Slides native draft executor #7002 is code-tested, not
  independently connected to a production OAuth broker / real D1 ledger.
- No workflow here disables legacy tasks. Per-job output proof, owner gate,
  execution lease, human approval (where needed), post-deploy service
  readback, and verified legacy-disable receipt are still necessary.

When the operator re-checks ChatGPT tasks, update this snapshot and tests with
the new observation. In a future cutover, reject an old snapshot; never invent
an API connection or silently infer that disabled tasks were transferred.
