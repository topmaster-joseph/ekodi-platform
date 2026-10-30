# EKODI Education · GitHub API quota 403 protected recovery checkpoint

- Incident #6936 and official prior merges #6913, #6946, #6971: farm marketing workshop accepted in synthetic local Chromium at 320, 390, 768, 1366 and 1440 px, but real `/edu/study/farm-marketing/` and QR `?step=3` remain HTTP 404 as of 2026-10-30 after noon KST.
- **Measured first-party production release-blocking failure:** Education continuity reconcile jobs #40996892691 and #40997407362 both returned GitHub installation **HTTP 403 API rate limit exceeded** while fetching `/pulls` at 2026-10-30 03:29:56Z and 03:31:48Z.
- Source PR #7006 is superseded; EKODI Orchestrator sole release authority owns official recovery PR #7007, task `orch_recovery_92640ebb79b88060e47ed32e9104581e`.
- Proposed change: bound trusted first-parent Git commit history to 200 commits, identify latest Education-owned change with zero REST calls, lookup only its exact merged PR, preflight the installation token's GitHub quota and **defer** safely when depleted, keep receipt/source CI/protected main + staging/production release gates fully intact.
- **This is a documentation-only, owner-authored evidence checkpoint** to trigger authentic PR-required checks on the EKODI-issued branch. It does not itself authorize production deployment, weaken validation, change credentials, or skip CI.
- Require pre-approval full CI, protected merge, canonical receipt, existing `deploy-education.yml` actual production `workflow_dispatch`, real mobile and desktop acceptance, and evidence of published Worker SHA, before closing #6936.
