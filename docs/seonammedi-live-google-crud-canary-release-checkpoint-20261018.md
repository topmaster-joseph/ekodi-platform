# SeonamMedi live Google writer/admin CRUD canary — protected release record

## Owner Human Gate
- Original functional PR: #5215.
- Owner-approved exact source SHA: `7f1588fccf829d2505e9ee9a1b15c6bbc6a2cce6`.
- Owner GitHub comment: `EKODI-HUMAN-GATE-APPROVE:7f1588fccf829d2505e9ee9a1b15c6bbc6a2cce6`, posted before `orchestrator-human-gate-approved` label.
- Official recovery PR: #5218, task `orch_recovery_7f1588fccf829d2505e9ee9a1b15c6bb`.

## Exact release scope
- Add manual-only, main-only and fail-closed GitHub Actions real Google writer/admin CRUD production canary.
- The canary requires two independently Google-authenticated scoped credentials stored only in GitHub Actions secrets.
- Writer must not have `voices` administration authority. Admin must have canonical site-core `voices` permission.
- Only uniquely marked canary entries generated in that run may be edited or soft-deleted, with queue and cross-domain persistence readback.
- No application Worker, Google provider, public site's notices, finances, existing citizen records, calendars or permissions changed by this PR.

## Evidence requirements
- The source SHA must remain in recovered branch ancestry after synchronization with latest protected main.
- Require real GitHub Actions tests, Cloudflare release boundary audit, security, constitution, orchestration and parallel conflict check on the exact refreshed head.
- Never infer success from `action_required`, skipped jobs, synthetic mocks or GitHub status replays.
- Merge only via official orchestrator-protected process; this code change does not need to deploy Independent Board Worker.
- Real Google authenticated publish/edit/delete remains UNVERIFIED until a manually triggered live canary passes with valid real credentials and authorized identities.

## Cancelled queue retry

The first protected convergent merge Actions run `39055698068` was cancelled while GitHub scheduling was in progress, although all mandatory checks on `bda818f454c88ac6596fe5737de1259532049f05` had passed. This documentation-only owner-authored retry triggers a new official `EKODI Orchestrated PR Convergent Merge` run and requires fresh CI on its exact HEAD. Neither the source Google canary code nor the original owner-approved functional SHA is changed; do not merge outside the official orchestrator.
