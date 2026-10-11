# EKODI native browser — Cloudflare 429 load-isolation release

## Scope
The standard background browser worker stays read-only and fail-closed on HTTP 429/502/503/504. The independent Church nine-language diagnostic is opt-in with `church_locale_diagnostic=true` and does not add nine page navigations to routine platform smoke runs.

## Grounded evidence
- First-party native browser run #38098599105: Church languages succeeded; a later `/journal` navigation encountered Cloudflare 429 and the generic job failed.
- First-party native browser run #38101580288 after isolation: native contract and generic Chromium smoke succeeded.
- Source PR #4149, original head `c6456088085ef80fbe4a0c0621c9fd9728aa3bbf`.
- Official release task `orch_recovery_c6456088085ef80fbe4a0c0621c9fd97`; integration candidate #4150.

## Production acceptance
Protected CI, EKODI Orchestrator receipt verification, related-change review, official merge and live own-browser regression are required. A Cloudflare 429 remains a failure record. This change is **not** permission to bypass or lower traffic limits.

The newest protected `main` was integrated concurrently. Revalidate this synchronized release branch using all required checks; no stale head status may be treated as fresh evidence.
