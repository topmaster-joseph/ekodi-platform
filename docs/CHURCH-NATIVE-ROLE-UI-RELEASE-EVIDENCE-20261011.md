# EKODI-owned Chromium proof: Church inline admin lifecycle

The production Church site was first found broken by the **EKODI first-party** ephemeral Chromium test, not an external desktop service:
- Run #38135300886 attempt 1 showed `church-worship-admin.js` loaded, but `Content-Security-Policy connect-src` refused the canonical Supabase function host.
- Independent Church source PR #106, merge `4483be8b76f5ae07246769e8c8fb1924b900a783`, restricted its CSP change to the one existing Supabase project.
- Official protected EKODI Core PR #4234, merge `ea338e2b395e09a914dec88dd855ec528b08deda`, dispatched guarded Pages production run #38136460992, **success**: live HTTP CSP header and nine-language browser verification.
- Re-run EKODI Chromium #38135300886 **success** on real served page: guest hidden; synthetic permitted visible; repeated focus one link; synthetic revoked hidden; synthetic logout hidden and no follow-up request.
- Browser evidence artifact 11701131103. Disposable browser profile; no real user secrets; no mutation.

Recovery #4236 uses official Orchestrator receipt task `orch_recovery_9f333e866c10949edd3225f4fb8624be`, source authoring PR #4224 exact SHA `9f333e866c10949edd3225f4fb8624be4606a47b`. These proofs do **not** satisfy the remaining separate real Google operator-200/revoked-403 end-to-end authorization requirement. Source PR was closed as duplicate; this official branch is sole integration candidate.

Triggering the EKODI Convergent Merge controller on this branch is authorized only through its receipt, CI and protected merge guards. This documentation adds no new backend role or deployment secret.
