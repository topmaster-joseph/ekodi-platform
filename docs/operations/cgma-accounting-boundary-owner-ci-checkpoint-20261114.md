# CGMA accounting boundary — authenticated official-release CI checkpoint

Date: 2026-11-14 (Asia/Seoul). Owner issues: #9608, #4617.
Official EKODI Orchestrator recovery: PR #9707, task `orch_recovery_b7b45c0be2fc29dd311a6dec78f599e9`.
Source PR #9702, exact source SHA `b7b45c0be2fc29dd311a6dec78f599e9c95ec208`, source full CI #43483178778 passed.
Separate CGMA source PR topmaster-joseph/cheonggye-market#226 was source-gated and squash-merged as `4de60e6d9c15110e5a30f326b0380bd0007f1592`.

## Reason for non-executable owner-connected checkpoint

The first-party Orchestrator issued the official recovery branch, and GitHub marks bot-authored PR check runs as `action_required` rather than executing them. Main has advanced and the official branch was synchronized to current protected ancestry; passing original source checks alone does not authorize a production release of the newer head. This documentation-only commit requests authentic required CI on that current official PR head and the already existing protected convergence workflow. It is neither a review bypass nor approval/status forgery.

## Scope and protected release ordering

The CGMA public `ekodi.kr/cgma*` route is independently owned by the `cgma-root-gateway` Worker from the `cheonggye-market` repository, not the Shared Site Core Worker. Candidate run #43480668603 proved three shared accounting routes at 0% but correctly rolled back on a mismatched CGMA HTML fallback. This official PR #9707 leaves four Shared Site accounting routes (EKODIBIZ, Church, Mission, SeonamMedi) with strict 200/required content/headers, removes only the CGMA candidate and conflicting Shared Site exact binding, and does not weaken a single remaining candidate or rollback verification.

The next CGMA protected release is separate: draft central PR #9705 pins the independently merged CGMA source and adds receipt-backed read-only production route checks. Do **not** merge/deploy #9705 before this Shared Site release has passed staging, 0% candidate, 100% promotion, postpromotion verification, and Singles member/native desktop/mobile acceptance. Reconcile the overlapping test file against newest main before promoting #9705.

No JavaScript/Worker runtime, CI workflow, credentials, finance-publication rights, private payment/identity data or permissions are changed by this checkpoint.

## Completion evidence required

Authenticated required check runs on current official PR head, Constitution/Security/Conflict/Orchestration gate, protected merger receipt, staged and guarded release with real hostname verification, genuine owner-scoped CGMA production gateway delegated accounting HTML, authenticated/guest Singles safety gates and PC/mobile proof. All unsuccessful and externally gated steps remain explicitly incomplete.

## 2026-11-14 protected main-convergence continuation

The owner-connected previous official-head checkpoint `1ad4c377bfd0ad1b8c6cc6df99e9a6c512661c07` passed genuine CI run [43484877578](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43484877578) and authentic constitutional/Cloudflare/Orchestration/parallel conflict checks. The protected convergence workflow subsequently updated this same official branch to `433f2d960eb31d2926f35dcc3a7e84e30729dcc5` to incorporate newer main ancestry, so original authentic green checks alone cannot authorize a different commit. This non-executable continuation requests fresh exact-current-head tests only; it changes no runtime behavior, policy, secrets, service authority or protected merge rights. Preserve the already reviewed Shared Site vs CGMA independent-route ownership and use only the orchestrator protected merge and guarded deployment.

## Protected release final-main-sync authenticated verification

The preceding owner-authenticated current-head `f7d983eecd1a281ae0d8bf032a727ff2623ec36c` passed full GitHub Actions CI [43485616418](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/43485616418), Orchestration, Cloudflare boundary and Constitution. The official converger synchronized the branch again to `61de7ed3344431cbf6114fe8c1ec5e8a407e4ad1` and main ancestry now shows zero commits behind. This documentation-only authenticated continuation requests the final exact-head required checks for the unchanged bounded production fix. Its presence conveys no independent deploy privilege and must not bypass a protected merge receipt or guarded canary.
