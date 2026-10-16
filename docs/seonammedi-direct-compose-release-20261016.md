# SeonamMedi direct Citizen Voices compose release continuity

- Issue: #4957
- Approved source PR: #5028
- Exact approved source SHA: `a85218ac647d7aeb0c39fc42ace3ee6bb8be85fa`
- EKODI Orchestrator task: `orch_recovery_a85218ac647d7aeb0c39fc42ace3ee6b`
- Protected recovery PR: #5030

The owner approved the exact source revision above. The authoritative EKODI release-provenance workflow created the D1-backed receipt, recovery branch and PR #5030.

This documentation-only continuity commit requests authentic protected checks after GitHub classified the workflow-created recovery PR checks as `action_required`. It does not change authentication, authorization, session handling, board data, Cloudflare configuration, or production credentials.

The runtime change remains limited to the approved source: the top-level Citizen Voices menu carries an explicit `compose=1` intent; the independent board performs at most one automatic Google identity redirect for that intentional entry; after a verified Google session returns to the exact board URL, the composer opens and the intent parameter is removed. Existing Bearer validation, administrator permission gates, 401/403 behavior and independent-board ownership remain intact.

Completion still requires genuine required CI, protected merge, guarded Shared Site / Independent Board release as applicable, rollback protection, and live verification on both `seonammedi.kr` and `ekodi.kr/seonammedi` in desktop and mobile. Anonymous guest checks cannot substitute for a real authorized Google session. Positive post/reply, scoped administrator edit/delete, unprivileged denial, canary cleanup and short-lived session revocation must be evidenced without logging tokens or personal data.
