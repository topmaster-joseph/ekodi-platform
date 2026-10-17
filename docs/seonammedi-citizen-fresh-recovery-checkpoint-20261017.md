# EKODI Citizen Voices Clean Rebuild — protected recovery checkpoint

- Source PR: #5137, expressly owner-approved functional SHA `95361a11766783dd644aeddafaac35dfc7991989`.
- Official orchestrator recovered PR #5153; release task `orch_recovery_95361a11766783dd644aeddafaac35df`.
- Protected merge initially blocked by `latest_main_not_in_source_ancestry` (HTTP 412).
- This **documentation-only** commit is on the official recovery branch to trigger real required CI and the existing protected `update-branch` convergence; it is not approval for a new functional source revision.

## Required scope
- Citizen-voices V3 starts with empty `citizen_voices_fresh`, server-enforced Google write and independent voices admin permission.
- Retire canonical legacy citizen routes, disable old citizen queue messages, then remove **only** old citizen posts, replies and media; user expressly requested permanent disposal without importing them into V3.
- Notice, finance, schedule, unrelated files and their media stay unchanged.
- Old legacy deletion must **not** begin until both hostnames confirm new UI and legacy API HTTP 410 plus legacy-queue disabled. Do not report deletion without actual Cloudflare D1/R2 execution evidence and comparison of before/after counts.
- Inspect deletion boundaries and media references before final destructive execution. Never delete the whole D1 database or R2 bucket.
- Positive signed-in Google writer, published public list and administrator edit/delete tests are distinct from anonymous API protection; no scoped Google canary token means positive probe was **skipped**.

## Protected gate requirements
After current main is natively synchronized, real CI on the resulting current HEAD, conflict/constitution/security checks, trusted receipt, owner exact-source-SHA marker, guarded orchestrator merge and Cloudflare deployment must pass. Do not fake checks, overwrite main or bypass branch protection. Preserve old source approval in ancestry and stop on a newly detected conflict.

## Verified current-main native branch synchronization
- Official orchestrator has natively synchronized main into recovery #5153; bot-created HEAD `0b48f42eb89d86741d94970e19522e0b656d7186` inherited original owner-approved functional source commit.
- Verified post-sync Worker still serves the fresh citizen UI, HTTP 410 legacy citizen API, and old citizen queue retirement; fresh D1 migration is present.
- Native GitHub check status on bot-created commit is `action_required`. This **documentation-only** continuation requests genuine required CI on the synchronized functional tree, with protected convergence retained. Do not count bot-generated skipped CI as passed.

## Second main convergence after unrelated production deployment
- Main changed to `4e5c088197dcd14a3e0e6b87ab48bb82824c2a34` while first verified-head CI was in progress. Orchestrator native refresh produced recovery HEAD `ed76fff5a37f6bf0fe37811cf7978cea7f59ef4d`.
- The other board deploy `39025310356` was of existing main and still ran old queue-create-list-reply canary. Its success does NOT establish fresh citizen board deployment or deletion.
- Checked synchronized recovery Worker still routes the clean V3 citizen board, retires old citizen APIs, and retains guarded legacy purge only in protected release workflow.
- This document-only checkpoint triggers current SHA CI. Destructive purge must only run on production release after both domains' new board and old-API retirement are verified, and must not touch notice/finance data.
