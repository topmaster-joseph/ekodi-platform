# EKODI Church Pages guarded release contract

The independent `topmaster-joseph/ekodi-church` repository owns the Church public website. The central EKODI platform owns its approved Cloudflare Pages deploy workflow.

The workflow requires an exact `ai/<agent>/orch_<task>` branch and an EKODI Orchestrator task ID on manual dispatch, using the existing receipt validator. Only protected PR merger or authorized release operators can supply this provenance. Do not relax the Cloudflare token, mission governance or deployment gate.

The Orchestrator's convergent post-merge dispatcher starts `deploy-ekodi-church-homepage.yml` only for Church-owned release-contract changes. The workflow checks out the current independent Church `main` as its source, runs its test suite, deploys to Cloudflare Pages and verifies the canonical `ekodi.kr/ekodichurch` release marker, public identity, member views and the new contextual `church-worship-admin.js` asset.

Validation should verify that `church-release.json.sourceSha` equals the exact Church revision deployed, not simply that the home page returns HTTP 200.

This Pages release is not proof that the separate Supabase `church-pastor-api` Edge Function is deployed. Track the independently guarded API release and real authenticated-role browser checks under issue #4092.
