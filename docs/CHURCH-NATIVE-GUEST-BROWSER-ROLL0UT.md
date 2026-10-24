# EKODI Church native public UI proof — guarded release

This PR changes only a first-party test script, an ephemeral browser workflow, and test contracts. It does **not** change live Church or Supabase application code.

## Proof from actual production

- Source PR: #4429, exact original head `2a7e00970d452c9ca467c2607162c5e515a31a30`.
- Official Orchestrator task: `orch_recovery_2a7e00970d452c9ca467c2607162c5e5`; receipt authorized, authority EKODI Orchestrator.
- EKODI-own isolated Chromium run: #38275237491 — successful.
- Two actual production browser sizes: mobile 390×844 and desktop 1440×900.
- Production homepage HTTP 200 in both; privileged guest admin link hidden; target `/ekodichurch/admin/worship`; no JavaScript runtime errors.
- GitHub evidence artifact `ekodi-church-native-guest-38275237491` uploaded successfully.
- Source and recovery CI both green. Cloudflare boundary for official recovery branch green.

## Safety and closure conditions

- GET/HEAD/OPTIONS-only network, ephemeral browser, no downloads, no existing user browser profile or Google session.
- Do not interpret an anonymous browser test as real authorized operator login, genuine 200 for admin, 403 for separately signed-in unauthorized user, or live role revocation.
- Supabase `church-pastor-api` is independently ACTIVE v10 and identical to protected `main`; the test should not attempt to deploy a new function.
- Preserve protected release checks, exact task receipt, and official EKODI Convergent Merge. Direct protected merge may be blocked while a newly generated merge-test SHA is pending checks; use the official documented convergence lane, never forge statuses.
- Remaining authenticated end-to-end requirement is tracked in issue #4092 and requires a legitimate EKODI/Google administrator session.

This owner-authored release document is the official post-source evidence record and requests checks on the current Orchestrator branch head.

## Protected main synchronization — owner-triggered verification

The official EKODI Convergent Merge updated the recovery branch to current protected main and returned `branch-updated` for PR #4432. GitHub marked the resulting bot-authored PR checks `action_required`. This owner-authored documentation-only commit requests fresh mandatory CI, native Chromium, Cloudflare boundary and Orchestrator checks for the **new synchronized SHA**. No execution contract, production route, role or secret is changed and no check is bypassed.

## Concurrent protected releases — renewed owner verification

A second official synchronization with protected `main` superseded the previous checked head while unrelated approved EKODI PRs were merging. GitHub marked the new bot-authored head `action_required`. Revalidate this latest head with owner-authored protected checks; keep the actual guest Chromium execution, no secrets, no shared user browser and no alternate merge policy. The prior success is retained as audit evidence, not reused as a fresh head status.
