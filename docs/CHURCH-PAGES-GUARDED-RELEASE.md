# EKODI Church Pages guarded release contract

The independent `topmaster-joseph/ekodi-church` repository owns the Church public website. The central EKODI platform owns its approved Cloudflare Pages deploy workflow.

The workflow requires an exact `ai/<agent>/orch_<task>` branch and an EKODI Orchestrator task ID on manual dispatch, using the existing receipt validator. Only protected PR merger or authorized release operators can supply this provenance. Do not relax the Cloudflare token, mission governance or deployment gate.

The Orchestrator's convergent post-merge dispatcher starts `deploy-ekodi-church-homepage.yml` only for Church-owned release-contract changes. The workflow checks out the current independent Church `main` as its source, runs its test suite, deploys to Cloudflare Pages and verifies the canonical `ekodi.kr/ekodichurch` release marker, public identity, member views and the new contextual `church-worship-admin.js` asset.

Validation should verify that `church-release.json.sourceSha` equals the exact Church revision deployed, not simply that the home page returns HTTP 200.

This Pages release is not proof that the separate Supabase `church-pastor-api` Edge Function is deployed. Track the independently guarded API release and real authenticated-role browser checks under issue #4092.

## Synchronized release check

After the Orchestrator updated this branch with the current protected `main`, the repository owner re-runs required statuses on the new head. This synchronization does not itself mean the static Church source was deployed; check Cloudflare release evidence and the exact `church-release.json` SHA before completion.

## Automatic drift reconciliation (2026-10-17)

The hourly reconciler and 15-minute watcher remain read-only on scheduled runs. A drift result is **not** deployment authority. The old watcher/cron dispatches omitted mandatory `release_branch_ref` and `release_task_id`, causing repeat invalid release attempts. Both now call `scripts/dispatch-guarded-church-release.mjs`; missing receipt yields an explicit pending notice without contacting the deployment endpoint. Authorized EKODI workflow_dispatch supplies the task/branch pair; the helper re-fetches the canonical release receipt and dispatches the existing guarded Pages workflow only after exact task, branch, authority and authorization match. The deployment workflow independently verifies provenance again.

The guarded deployment must prove `church-release.json.sourceSha` equals current independent Church main *and* the 2026-10-18 worship page contains the correct scripture and stage/operator routes, not the homepage fallback. Never fake a release receipt or remove mandatory gates to advance the date-sensitive worship release.
