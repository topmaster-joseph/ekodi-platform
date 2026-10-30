# EKODI Education protected source synchronization release continuity

2026-10-30 | Issue #6936 | EKODI Orchestrator official recovery PR #7037 | task orch_recovery_80840d16580fb38e082811009b0d68c7

## Measured incident
- Previous official Education merges #6971, #7011, #7017 deployed inconsistently because merge event workflow_run reported an **old source SHA** after protected PR branch synchronization.
- For official PR #7017: merge commit e7221e3a42fe72cf92a635401bbd64732c44deda, final source head 4120eab08ef6fd702c3a6b2cee6636887be9ba4c, but continuity workflow run #41006537348's stale event carried dc9ebac2...; job succeeded with no_exact_verified_merge, **no production dispatch**.
- Snapshot source required CI test + EKODI AI Orchestration Gate SUCCESS; authoritative Orchestrator release receipt authorized true. Latest main advances strictly non-Education; /compare/e722...c79... ahead 2 with management and search only.
- Live /edu/study/farm-marketing/ and seven QR links 200, but total production Education native acceptance still pending from earlier legacy CSP failure.

## Protected fix scope
- Successful convergence event acts only as wake-up. Select one exact official branch PR that is already closed, merged into protected main and has valid SHA.
- Never trust the old workflow_run SHA as a release source. Existing verifyEducationReleaseSnapshot fetches authoritative merged PR, source CI, merge association, protected-main ancestry/no later Education changes and the EKODI Orchestrator receipt. Any violation fails closed.
- Preserve GitHub API preflight budget, duplicate dispatch prevention, max 3 attempts per release SHA, protected production job, first-party 5-size ephemeral Chromium.
- Regression coverage: stale event, ambiguous PR, invalid branch SHA, target not main, unmerged PR. No direct release or fake gate statuses.

## Action policy
Source #7034 superseded; official recovery #7037 is the only merge candidate. This owner-authored documentation-only update triggers **genuine CI checks** on the orchestrator-issued branch rather than trusting bot action_required. Do not close issue #6936 until full deployed production Chromium/classroom/farm/PNG/Studio/document checks pass.
