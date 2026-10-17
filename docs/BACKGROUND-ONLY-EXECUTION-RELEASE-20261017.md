# EKODI background-only automatic execution — protected release checkpoint

## Source owner approval
- Original source PR: #5139.
- Owner approved original executable source SHA: `8a1436380edd1ecdb859aca4232d32537057b710`.
- GitHub account owner exact marker: https://github.com/topmaster-joseph/ekodi-platform/pull/5139#issuecomment-6232640501
- `orchestrator-human-gate-approved` label was applied **after** the exact-SHA comment.
- Official EKODI D1-backed Orchestrator recovery task: `orch_recovery_8a1436380edd1ecdb859aca4232d3253`.
- Official recovery branch: `ai/chatgpt/orch_recovery_8a1436380edd1ecdb859aca4232d3253`; recovery PR #5147.

## Why this owner-authored documentation-only checkpoint exists
The GitHub Actions bot created the protected recovery PR at the exact approved SHA, but GitHub assigned the new pull-request-triggered workflows `action_required` rather than executing them. This **documentation-only** owner commit requests actual required CI without changing the originally approved executable files or skipping any protection. Old source-branch green checks do not substitute for fresh protected recovery checks.

## Mandatory scope
- Automatic GitHub Actions/CI/deployment status and logs use authorized official APIs. Do not open new user-owned Opera/Chrome tabs, windows, or an interactive login on failure.
- Isolated EKODI-owned headless browser/desktop workers require explicit verified no-focus-steal, no-user-tab, no-user-profile-reuse, no clipboard or host-input access, and owned-process/profile cleanup.
- Keep user windows/tabs and live credentials untouched. OAuth, CAPTCHA and privileged consent still require their existing human gate. No external paid browser fallback by default.
- Preserve constitutional policy `AUTOMATIC-EXECUTION-LIFECYCLE-001` and the independently guarded deployment/release paths. No direct main push, no direct production write, no CI bypass.

## Protection and acceptance
Run owner-triggered real CI, constitution, security, branch-conflict and official Orchestrator receipt gates on recovery PR #5147. Converge with latest protected main through existing guarded workflows, then apply staged/protected promotion where relevant. No merged/deployed/completed claims without genuine records.

Run first-party EKODI PC USER2 / USER3 / USER4 actual no-window canaries only on online, eligible, heartbeat/lease/capability-verified nodes. Record task ID, node identity, no new Opera/user tabs, no focus theft, cleanup of only EKODI-owned temporary resources, and 401/403 `AUTH_REQUIRED` fail-closed behavior. Missing or insufficient live device evidence remains **not verified**.

This checkpoint is neither a second Human Gate approval nor a claim of production readiness.

## Verified protected-main convergence
- Official Orchestrator synchronized latest main into recovery PR #5147 at `9a67447558a5863cb0c4bdfb77fb54be707e8a9a`.
- The first owner-authored recovery CI suite at `74d127f63d8671ae3d307f80c594585c31066121` passed all eight pull-request workflows. This is **not** permission to substitute old checks for the synchronized head.
- GitHub marked all new orchestrator-authored synchronization checks `action_required`, so this second **documentation-only** GitHub-owner commit requests real protected checks on the synchronized source.
- The originally human-approved source SHA remains in ancestry, and no authorized runtime implementation, privilege boundary, or production deployment is altered by this documentation change.
- A final merge, deployment, PC/mobile validation and actual no-user-tab/no-focus-steal live receipt remain required before any success claim.
