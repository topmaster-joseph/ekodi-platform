# EKODI Education farm marketing · verified release continuity checkpoint

- Date: 2026-10-30 (Asia/Seoul). Approved by user: complete 3-hour/30-farmer mobile AI marketing education page and PPT using EKODI Orchestrator as sole commander.
- Incident: #6936. Original source protected merge PR #6913 and Chromium-acceptance merge PR #6946 exist, but `https://ekodi.kr/edu/study/farm-marketing/` and `?step=3` were still **HTTP 404** in independent live inspection on 2026-10-30.
- Related source PR #6968 is superseded by the official EKODI recovery PR #6971 and orchestrator task `orch_recovery_f1f45c5a8c24b2c62b95c68221baf7b8`; do not merge duplicate sources.
- Cause in previous deploy lane: Education staging succeeded but post-merge production was skipped, because competing approved main merges advanced SHA before release continuity.
- Official branch now has protection-preserving, source-verified ancestor check; it rejects any new Education-owned change after the authorized merge and caps automatic retries. It checks canonical EKODI release receipt, authentic required source CI, and exact protected main checkout.
- **This owner-authored documentation-only checkpoint triggers genuine protected PR CI on the EKODI-issued branch; it grants no new release authority and changes no runtime, credentials, database, payment, or Cloudflare permissions.**
- EKODI must confirm correct protected merge, schedule/dispatch authorization, isolated staging and guarded production release, then use native disposable Chromium at 320/390/768/1366/1440px to verify the actual live course, QR deep links 1–7, same-origin JS/CSS, PNG download, template prompts and Study navigation.
- Completion is prohibited until the public canonical URL serves HTTP 200 and actual PC/mobile interaction passes. Publish evidence to #6936; keep existing rollback/human gates intact.
