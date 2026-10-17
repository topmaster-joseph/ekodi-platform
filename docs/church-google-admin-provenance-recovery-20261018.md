# EKODI Google administrator recovery · protected CI handoff (2026-10-18)

Source PR: #5209, immutable owner-approved executable source `599b05510674d2b6feef60e8ae0660a9ac9f1e57`.

Owner exact-SHA approval marker: https://github.com/topmaster-joseph/ekodi-platform/pull/5209#issuecomment-6238041916 ; `orchestrator-human-gate-approved` label applied after the comment.

Official EKODI orchestration task: `orch_recovery_599b05510674d2b6feef60e8ae0660a9`; release branch: `ai/chatgpt/orch_recovery_599b05510674d2b6feef60e8ae0660a9`; official recovery PR #5217.

This documentation-only CI resumption checkpoint changes **no executable code** relative to the exact approved source. The task includes a protected 2-account platform superadmin recovery, Google verification without blanket role grants, the Church-scoped verified `ekodichurch@gmail.com` manager, and a vacant-site bootstrap RPC, audit and UI.

Independent read-only production query before this release: both protected platform-admin accounts retain active church site grants; `ekodichurch@gmail.com` has a verified linked Google identity, but no active `site_access_registry` church manager grant. The bootstrap RPC and audit table do not exist in production. No actual Chrome/Opera Google sign-in, live room publication, or finance/role operations have been verified after deploy.

**Required:** The original official orchestration receipt and full branch-protection CI, staging migrations/Edge APIs/route checks, guarded merge, guarded deployment, rollback protection, PC/mobile real Google login and cross-site denial verification. No manual main push, credential bypass, false statuses or operational-complete claim. An `action_required` automated PR status is not a passing test.

## Parallel protection evidence and official convergence resumption
- Related Admin Control changes found in PR #5220 and PR #5223. Exact path overlap with #5220 is `control.html`; #5223 is a related canonical Admin Control routing change. 
- Mutual review and integration order for PR #5217 first: https://github.com/topmaster-joseph/ekodi-platform/pull/5217#issuecomment-6238174968 and https://github.com/topmaster-joseph/ekodi-platform/pull/5217#issuecomment-6238220666.
- The latest parallel conflict guard run 39056162623 succeeded after owner-reviewed evidence and the `related-change-review-complete` and `integration-order-approved` labels. 
- This append-only checkpoint triggers the **existing** release-branch push CI and orchestrator convergence contract with the required latest main update-branch, not direct branch mutation or merge. Existing executable source and the original owner-approved exact SHA remain unchanged.
- No Google real-login, Sunday broadcaster host permission, QR camera playback or streaming viewer evidence has been observed at this checkpoint. Do not claim live readiness from CI.

## GitHub update-branch check regeneration (2026-10-18)
The official EKODI orchestrator refreshed this release branch to `930fb57d8dc57a3baab614fbe919c79b38d30196`, but the GitHub-token-created commit received `action_required` status instead of executing authentic PR CI. This documentation-only, owner-authored continuation requests original GitHub Actions checks without changing any Google authorization, SQL migration, or Church Live executable code. The owner's immutable approval of source SHA `599b05510674d2b6feef60e8ae0660a9ac9f1e57` remains the underlying consent; merge, guarded release and real-user verification must still pass independently.
