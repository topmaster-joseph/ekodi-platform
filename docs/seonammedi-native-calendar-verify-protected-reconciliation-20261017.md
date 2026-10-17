# SeonamMedi live calendar verification — guarded orchestration reconciliation

- User-approved source PR: #5163, exact functional SHA `95c01f20958afebed5f1d8dbdda95cae82d18eeb`.
- Owner approval comment: https://github.com/topmaster-joseph/ekodi-platform/pull/5163#issuecomment-6233208729
- Official EKODI release recovery PR: #5166; source task `orch_recovery_95c01f20958afebed5f1d8dbdda95cae`.
- Recovery source was originally byte-identical to approved source; no runtime or test assertion is changed in this reconciliation note.
- Recovery automation stopped at `guarded-pending-http-412 / latest_main_not_in_source_ancestry`.
- The original source has already passed the nine required PR checks, including first-party Chromium source verification.
- This owner-authored, documentation-only continuation on the **official orchestrator recovery branch** wakes genuine GitHub PR checks and EKODI's own convergent merge, which must safely synchronize protected main before protected merge.
- Never mark bot-created `action_required` checks as passing or bypass branch protection, exact-source approval provenance, authentication, privacy, or protected rollback.
- Following merge, repeat the **live**, read-only native Chromium verification for both `https://ekodi.kr/seonammedi/` and `https://seonammedi.kr/`, PC 1440 and mobile 390, including all six routes, compact calendar, absence of duplicate left menus and horizontal overflow.
- Earlier live verifier reported `live_schedule_calendar_missing` because it read DOM before the asynchronous calendar mount. The approved functional change waits up to 15 seconds for the **real** calendar; an absent calendar must still fail.
- Preserve every existing notice, activity, schedule, citizen content, OAuth behavior and administrator permission.
- This note is not an authorization to deploy or merge directly; completion requires authentic protected CI and production evidence.
