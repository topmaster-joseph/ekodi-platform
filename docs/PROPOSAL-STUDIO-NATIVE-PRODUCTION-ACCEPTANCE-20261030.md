# EKODI Proposal Studio — native production acceptance

## Exact release basis

- Official source PR #6907, recovery PR #6908, protected merge `194553d406326f757ff5297403b1ef8bc1c632e0`.
- Official Shared Site Core run [#40925556281](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/40925556281) completed success, including general native desktop/mobile checks and post-promotion receipt.
- General platform checks do not establish that `/proposal/` itself loads correctly or that its generated files are downloadable.

## Separate, bounded verification

`.github/workflows/proposal-studio-native-production.yml` provides a controlled manual or PR-triggered verification that:
1. Runs EKODI's own `scripts/ekodi-background-browser-worker.mjs` in fresh 1440x900 desktop and 390x844 mobile Chromium contexts, checking the real public `https://ekodi.kr/proposal/` route, document controls, sample-only browser-local draft interaction, absence of console/network errors and horizontal overflow; screenshots retained for 7 days.
2. Runs another isolated, first-party Chromium context with explicit **temporary browser-local download** permission, no reusable profile and **GET/HEAD/OPTIONS-only network interception**; uses synthetic title, idea and budget only, with no production API writes.
3. Downloads actual generated `.docx`, `.xlsx`, `.pptx` Blob outputs and checks ZIP CRC and all OOXML XML parts using Python's standard library. This validates basic Office document structure, **not** advanced Microsoft Office/한컴 rendering, accessibility, or uploaded template fidelity.
4. Writes evidence to a short-lived Actions artifact. The samples are never uploaded to EKODI user storage; no external browser automation provider, shared cookies or login sessions are involved.

## Release and success criteria

- Test PR CI and protected release authorization remain required. Never mark native production acceptance as passed until the Actions job itself succeeds for the exact source revision and the evidence is inspected.
- The existing `/proposal/` route is public; no login or identity capture is necessary for this verification.
- If Cloudflare quota/429 blocks a probe, stop without bypassing throttles. No retries intended to evade the quota circuit.
- No server persistence, external AI research, HWPX conversion or existing Office template copying is claimed.
