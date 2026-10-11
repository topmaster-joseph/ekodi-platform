# EKODI Church CSP: official first-party release evidence

## Approval and change provenance
- Church Pages independent source PR: topmaster-joseph/ekodi-church#106, merged source revision `4483be8b76f5ae07246769e8c8fb1924b900a783`.
- Core authoring PR #4232 approved exactly SHA `1748d32d7c9512da285993e4d780f291b5e135d7`.
- Official EKODI Orchestrator release task: `orch_recovery_1748d32d7c9512da285993e4d780f291`; read-only receipt confirmed `authorized=true`.
- Official protected convergence PR: #4234, sole winner after related-change review. Source #4232 closed duplicate.

## Native Chromium root-cause proof
The first-party EKODI-owned isolated Chromium run #38135300886 loaded the actual Church homepage and recorded HTTP 200 for `church-worship-admin.js`, plus a CSP refusal to connect to the canonical Supabase project before the browser could request the worship role capability. This is a real client-side policy defect; neither a fabricated token nor a database grant could fix it.

## Guarded release acceptance
The Church Pages workflow validates the source `_headers` policy before deployment and checks the live `content-security-policy` HTTP header after promotion. Only the exact existing Supabase project is newly allowlisted in `connect-src`; the rest of the Church CSP stays strict. Any header mismatch must leave the release red.

After official Pages deployment, rerun the first-party EKODI Chromium UI lifecycle PR #4224 (with its synthetic role response fixture clearly identified) and verify anonymous API denial separately. A real authorized Google administrator session still requires independent operator-positive evidence.

This documentation commit causes the existing EKODI Convergent Merge controller to verify the active PR against protected main. No branch protection or CI bypass is authorized.

## Protected-main synchronization evidence

The official EKODI Convergent Merge run #38136214850 reconciled this branch with the current main and reported `branch-updated`. The exact approved source and required CSP checks are unchanged. This owner-authored follow-up requires fresh CI and native release guards on the synchronized head and allows only the official protected merge workflow to promote the release.
