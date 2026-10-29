# EKODI Education farm marketing guarded live acceptance · 2026-10-30

- Authoritative user direction: EKODI Orchestrator remains the sole release commander; non-EKODI AI is a replaceable implementation assistant.
- Source implementation: protected merge PR #6913, commit `90b2a6655581a1c1999b87fd41e09ab8b8d6a86c`.
- User-facing operational incident: #6936. Public `https://ekodi.kr/edu/study/farm-marketing/` returned HTTP 404 after code merge; Study navigation remained stale. Neither source merge nor screenshots are production success.
- Current protected recovery: PR #6946 from owner-approved #6943. Preserve exact authorized orchestrator task `orch_recovery_c00ab2855c048cdd6c1979daeb657f3f`, latest protected main reconciliation, real CI, no policy or quota bypass.
- Added first-party synthetic Chromium validation: five widths 320, 390, 768, 1366, 1440px; production 200; `?step=3` deep link; on-device prompt, 1080x1080 PNG download, persistence and quiz; attach test evidence to existing Education workflow.
- Staging must use existing Education Worker and Cloudflare Access isolation. Guarded production release must be initiated only by verified EKODI orchestrator receipt and current protected main SHA. Avoid direct Wrangler deployment, new subdomains, DB or secrets.
- **Owner-authored evidence-only checkpoint:** requests authentic required GitHub checks for the orchestrator-issued recovery branch; carries no implementation or authorization changes.
- Definition of done: all authentic CI green, official receipt, guarded release; live `/edu/study/farm-marketing/`, `app.js`, `styles.css`, `?step=1..7` and Study link confirmed on real PC/mobile. Update incident #6936 only with independent runtime evidence.
