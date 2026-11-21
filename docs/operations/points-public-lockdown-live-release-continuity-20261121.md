# EKODI Points credentialless production lockdown audit — official release continuity

Date: 2026-11-21 KST. Central tracker #7778.
Functional source worker PR #10021 SHA `9b43e1de85b40d0981b95b8de7e09530e3c2feaf`.
Orchestrator-created official recovery PR #10022. This file is a **non-executable release audit record**, not a secret, economic approval or deployed-service claim.

## Independent grounded production/development observations
- Supabase DEVELOPMENT `lxcxwbdwwojjkgybbqii`: guard migration `20261108224500` receipt present (1); both verified anti-unverified-award CHECKs present (1 each); ledger rows 0, wallet points 0, unverified heartbeat and devotional self-report enabled rules 0. Development SQL mutation and independent aftercare were previously audited on central #7778.
- Supabase PRODUCTION `renzehysxirjilvdxacv`: no Points economy tables (ledger/rules/wallet) and no Points migrations.
- Canonical live anonymous `https://ekodi.kr/my/config.js` contains a strict production JSON assignment with `pointsEnabled:false`.
- Canonical live anonymous `https://ekodi.kr/my/points/app.js` still contains `isCurrentHistoryOwner(snapshot,session)`, session-to-owner ID equality, site and rendering-revision checks. These are STATIC source assertions, not a claim of actual signed-in E2E.
- Latest E2E scheduled run [44823992995](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/44823992995) fails closed because GitHub `development` has incomplete static Cloudflare Access identity; owner-controlled 3-field recovery is still needed.
- Latest production backup Drive ACL [44719414084](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/44719414084) fails closed because protected `production` GitHub Actions lacks `EKODI_STORAGE_GATEWAY_KEY`.
- Separate authenticated user Google Drive **read-only** folder traversal found the intended shared-drive folder `99_BACKUP/SUPABASE_PROD` with `ENCRYPTED_DUMPS`, `MANIFESTS`, and `RESTORE_EVIDENCE` children, all **empty** on 2026-11-21. Google connector could not certify complete shared-drive membership; owner Storage Gateway authoritative ACL proof remains absent. Zero encrypted snapshots or isolated-restoration receipts.

## Source scope: independent PUBLIC-only safety check

`scripts/verify-points-public-lockdown.mjs` fetches exactly two fixed canonical public assets, `/my/config.js` and `/my/points/app.js`, with no cookie or authorization, GET only, redirect refusal and bounded timeouts. It parses (never evaluates) the config JSON and rejects any economic activation, non-production mode or missing session/owner/site/serial checks from the deployed JS. It reports `signed_in_e2e_verified:false` and `backup_verified:false` on success. `test/points-public-lockdown.test.mjs` exercises fail-closed cases. `.github/workflows/verify-points-public-lockdown.yml` is a daily scheduled and manual job on protected main, `contents:read` only, no credentials or data mutation, no browser tabs or focus changes.

The watcher is **not** a replacement for the staged full authenticated browser test, read-only shared Drive ACL proof, encrypted backups or dual-signed isolated restore. There is no economic activation approval; keep `POINTS_ENABLED=false`.

## EKODI orchestrated protected CI/merge

Source CI and official recovery CI must be real completed GitHub Actions checks against their exact commit SHA. A bot-created recovery PR may initially have `action_required` checks; such statuses are *not passing tests*. This documentation-only commit on the existing official recovery branch requests real owner-connected checks and exact-main convergence. The Orchestrator alone may merge the official protected PR. The worker must not directly merge or adjust branch protection.

After any protected merge, independently verify main source and production public assets. Do not claim a future scheduled job ran until its actual run and result are observed.
