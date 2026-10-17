# EKODI Google administrator recovery · protected CI handoff (2026-10-18)

Source PR: #5209, immutable owner-approved executable source `599b05510674d2b6feef60e8ae0660a9ac9f1e57`.

Owner exact-SHA approval marker: https://github.com/topmaster-joseph/ekodi-platform/pull/5209#issuecomment-6238041916 ; `orchestrator-human-gate-approved` label applied after the comment.

Official EKODI orchestration task: `orch_recovery_599b05510674d2b6feef60e8ae0660a9`; release branch: `ai/chatgpt/orch_recovery_599b05510674d2b6feef60e8ae0660a9`; official recovery PR #5217.

This documentation-only CI resumption checkpoint changes **no executable code** relative to the exact approved source. The task includes a protected 2-account platform superadmin recovery, Google verification without blanket role grants, the Church-scoped verified `ekodichurch@gmail.com` manager, and a vacant-site bootstrap RPC, audit and UI.

Independent read-only production query before this release: both protected platform-admin accounts retain active church site grants; `ekodichurch@gmail.com` has a verified linked Google identity, but no active `site_access_registry` church manager grant. The bootstrap RPC and audit table do not exist in production. No actual Chrome/Opera Google sign-in, live room publication, or finance/role operations have been verified after deploy.

**Required:** The original official orchestration receipt and full branch-protection CI, staging migrations/Edge APIs/route checks, guarded merge, guarded deployment, rollback protection, PC/mobile real Google login and cross-site denial verification. No manual main push, credential bypass, false statuses or operational-complete claim. An `action_required` automated PR status is not a passing test.
