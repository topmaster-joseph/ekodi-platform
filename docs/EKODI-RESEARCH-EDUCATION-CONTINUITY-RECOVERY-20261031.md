# EKODI Research / Education — guarded production continuity (2026-10-31)

## Verified incident
- Canonical Research service: `https://ekodi.kr/research/`.
- Original Research implementation: PR #7058, orchestrator-protected merged PR #7073, merge `a175b04b4600cd6c0524ce7a334789a2b6fd50ff`.
- Live read-only browser showed older Research UI, while `GET /research/api/literature?q=technology%20acceptance%20model` returned `research_storage_not_configured`. These are release-mismatch observations, not code-test failures.
- A previous post-merge continuity workflow `41066214371` skipped reconciliation. Open incident #7084 remains the source of release verification requirements.

## Recovery implementation
- Original code PR #7112, official Orchestrator recovery PR #7113, task `orch_recovery_3e5e77f0c7f6ca00ac5c839f52f00fe3`; source SHA `3e5e77f0c7f6ca00ac5c839f52f00fe39aab721d`.
- Adds `issue_comment` event to the existing protected continuity workflow. An exact standalone issue comment `EKODI-EDUCATION-RECONCILE` by the repository owner on a regular issue can wake the existing recovery checks.
- Any non-owner/edited comment, PR discussion, altered text, or unknown event is rejected; no external researcher credentials, private data, or production API are exposed.
- Release remains controlled by signed EKODI Orchestrator receipt, exact protected source CI, official merged PR ancestry, most recent Education-owned code, quota reserve, deduplication, bounded failed attempts, existing guarded staging/production workflow, native browser proof and rollback contract.
- Per-PR approval comments were retired by owner decision on 2026-10-19; this is not permission to bypass the enforced release verification.

## Mandatory sequence
1. Wait for authentic required CI on official PR #7113; no false status recovery, no direct default-branch writes.
2. After protected merge and live availability of the amended workflow, create a single owner-authored regular issue comment with the exact phrase on issue #7084.
3. Verify corresponding `EKODI Education Guarded Release Continuity` GitHub workflow ran and selected an authorized latest Education release candidate. A `previous_dispatch_exists` result requires checking the actual existing deployment rather than force retrying.
4. Confirm `Deploy EKODI Education` had real staging **and** production jobs on authorized `main`, with deploy receipt, canary and rollback check.
5. Read actual production `/research/`, `/research/health`, `/research/api/literature` positive/negative cases using EKODI-native PC/mobile Chromium. Reject completion if the menu or API is still stale, including cache and Site Core routing issues.
6. Close #7084 only after collecting all operational evidence. A merged PR or a successful PR-only staging job is insufficient.

## Authenticated CI renewal after EKODI main synchronization
- Official Recovery PR #7113 passed its first full source CI, Education native pre-approval contract, security checks and EKODI AI Orchestration Gate at `edfd80f2153291e8fffca385ef9561307ee2d667`.
- The protected convergence runner then synchronized latest main, creating head `800cd85f4b713c2fa9785a447c3c12add7b9f9ed`. GitHub's bot-triggered checks for that head returned `action_required` without execution; the old head's successes cannot certify the new head.
- This documentation-only edit requests authentic checks on the synchronized branch. No source script, trigger policy, credentials, owner gate, production runtime or deployment flags change.
- Do not merge or send a recovery issue command until new required checks are green and the official PR is protected-merged.

## Second bounded protected-main synchronization verification
- After the first recovery CI renewal, the EKODI convergence branch synchronized a subsequent protected main change at `33f421a89ca37dafeabad9503a899ca3d9f9293f`.
- Bot-created pull_request check runs remained action_required. This file-only change re-triggers genuine CI on the latest synchronized candidate; it changes no execution, authorization, protected release, rollback or data collection behavior.
- If source check status remains blocked, preserve the operational incident rather than claiming production success.
