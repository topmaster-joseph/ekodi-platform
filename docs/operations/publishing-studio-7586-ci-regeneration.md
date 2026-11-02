# Publishing Studio 7586 — GitHub CI regeneration checkpoint

Date: 2026-11-02 (Asia/Seoul)
Task: publishing-studio-7586-20261102
Source PR: https://github.com/topmaster-joseph/ekodi-platform/pull/7587
Official EKODI recovery PR: https://github.com/topmaster-joseph/ekodi-platform/pull/7602
Source SHA: 860c59b1e0f7b91325b5967518543966dd0dbc63

## Why this non-executable checkpoint exists

The original PR source SHA passed CI and all retrieved required checks.
The orchestrator-generated recovery branch produced GitHub Actions
`action_required` checks with zero executable jobs because its
pull_request event was emitted by automation. This owner-authorized
documentation-only commit requests real checks on the current
converged recovery head. It is not an approval or a CI bypass.

## Verified at isolated authorized execution node

- Node syntax check: `node --check publishing/studio/app.js` — pass
- Tests: `node --test test/books-network-contract.test.mjs test/auth-canonical-public-entrypoints.test.mjs` — 7 passed, 0 failed
- Canonical browser API: `https://ekodi.kr/api/books/me`
- Retired API subdomain has been removed from the active studio application.
- Canonical login return: `https://ekodi.kr/auth/?return_to=...`
- Identity-scoped books authorization remains server-side.

## Release guard

Only the EKODI protected orchestrator may merge or deploy this PR.
Real successful CI on the exact recovery SHA, protected merge, staging,
production asset and authenticated browser tests, and actual title/store
writes and read-back are still required. No live production completion
is claimed by this documentation.

