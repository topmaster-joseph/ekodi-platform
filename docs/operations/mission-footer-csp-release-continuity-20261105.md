# EKODI footer traffic CSP-safe release continuation — 2026-11-05

## Provenance
- Owner-requested public UI correction: separate Sunday/Saturday description removal and visitor metric spacing on EKODI Mission.
- Functional parent release PR #8253 merged as `d95d1ee5b1de169a34a01788f994cb99c23fb292`. Operating Space and Shell guarded deploy workflows succeeded, and browser tests confirmed removed duplicate copy and correct November 7 meeting time.
- Live browser discovered outstanding cosmetic defect: counters were present but CSS computed `display:block`, `column-gap:normal`, UTC note `flex-basis:auto` at widths 320, 390, 768, 1366, 1440.
- Live page CSP is `style-src 'self' https://ekodi.kr`; injected inline style element existed but `sheet.cssRules` was null. This explains why script-embedded styles were not applied.
- Original source PR #8257 (closed, not merged); source SHA `3c3f8c6bebed0625d3c6b6147fa50cd3bc550592`.
- Official EKODI Orchestrator recovery PR #8258, task `orch_recovery_3c3f8c6bebed0625d3c6b6147fa50cd3`.

## CSP-preserving correction
- Put public traffic metric layout in the existing, same-origin static `shell/user-ui-shell.css` that the live Mission page already loads.
- Never change the CSP, bypass trusted release rules or enable inline `unsafe-inline`.
- Keep responsive wrapping and 28px desktop/20px narrow viewport column gap; move UTC scope note to its own line.
- Guard new external style rules with a source-level regression test.

## Official checks and operational acceptance
- This documentation-only commit on the already issued recovery branch requests authentic CI after GitHub Actions-created bot checks returned `action_required`; it does not alter the functional source or grant authority.
- Guarded required CI + orchestration + conflict checks must be green at the latest official head, then orchestrator-controlled protected merge and Shell deployment.
- Canonical `https://ekodi.kr/ekodimission` must pass anonymous real-browser widths 320/390/768/1366/1440: no horizontal overflow, actual `display:flex`, CSS `column-gap=20px` at 320/390 and `28px` at 768+, note `flex-basis:100%`; counters remain server-sourced, not invented.
- Confirm the deleted description and badge remain absent, Saturday date/time accurately shows 2026-11-07 17:00, and no change to participation/auth or privacy.
- Record exact SHA, CI, official workflow IDs, browser evidence, canonical domain, and timestamp before declaring completion.

This note is not evidence of deployment or authorization for direct merging.
