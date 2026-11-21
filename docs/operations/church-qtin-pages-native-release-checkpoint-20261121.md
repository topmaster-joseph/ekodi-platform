# EKODI Church QTIN primary navigation — official guarded Pages release checkpoint (2026-11-21)

## Verified release source
- Independent Church PR: https://github.com/topmaster-joseph/ekodi-church/pull/189, protected merged source `2e6c4949aa21a7a54eb8333d2a0fdda72090f217`, three Church source checks passed.
- Central source PR: https://github.com/topmaster-joseph/ekodi-platform/pull/10096 (exact source `39c23c7b9947a4f24a1833ca8ec23aa62a2758fa`).
- Official EKODI Orchestrator recovery: PR https://github.com/topmaster-joseph/ekodi-platform/pull/10097; task `orch_recovery_39c23c7b9947a4f24a1833ca8ec23aa6`.
- Orchestrator latest-main reconciled head before this note: `dbaae0425b4c9a6bd616dbc3114f5864efb913d5`, 0 behind latest protected main at check time.
- GitHub automation-created merge-update emitted `action_required` placeholder runs; **these are not passing checks**. Source PR's real CI, Orchestration, security, Constitution, conflict and Supabase checks previously succeeded.

## Source preservation and safety
- The central `sites/ekodi-church/source-import-manifest.json` historic 223-asset canonical import, hashes and protected C3 cutover flag remain untouched. Legacy snapshot source verifier still recognizes its historical navigation in default mode.
- The actual independent Church Pages release MUST pass `--expect-qtin` on primary menu and each supported public subpage. Public main menu six-item action #6 is directly `/qtin/church`, never legacy MyPage, and canonical end-user route `/ekodichurch/my/` remains available behind scoped account access, including giving/attendance.
- Existing `deploy-ekodi-church-homepage.yml` has canonical/legacy source modes and retains official receipt-bound workflow_dispatch. No new 301/302/307/308 redirects, source switch, bypass, backup deletion, payment or broadcast triggered.
- Current read-only production check before Church Pages release: `https://ekodi.kr/ekodichurch/` still showed the old MyPage main nav; `/qtin/church` and `/qtin/mission` both rendered December 2026 catalog/order page, and `/ekodimission/` linked directly to the latter. No order was created.

## Required next steps
1. Run genuine GitHub CI and EKODI required checks on reconciled official PR head. Never accept bot `action_required` as success.
2. Official release converger must enforce latest main, exact source receipt, protected merge and then dispatch `deploy-ekodi-church-homepage.yml` with `release_branch_ref` and `release_task_id`.
3. Church Pages release must pass its preflight and staging, guarded promotion, native multilingual/mobile presentation and direct QTIN nav tests. If the existing long-lived browser test or member route check fails, debug without weakening the safety gate.
4. Verify production `/ekodichurch/`, `/ekodichurch/devotion/`, `/ekodichurch/notices/`, `/ekodichurch/schedule/` for one consistent, accessible menu; verify `/qtin/church` and Mission CTA `/qtin/mission` by read-only requests; keep authenticated `/ekodichurch/my/` functional.
5. Do not touch the user's personal Opera tabs or create a public synthetic live broadcast; use first-party isolated headless jobs. Report completion only after actual production screenshots/links and deployed SHA evidence.

This append-only document requests authentic owner-connected CI on the official latest-main branch. It does **not** modify functional assets or workflows, bypass review, fake statuses, or authorize deployment.
