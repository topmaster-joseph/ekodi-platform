# Education · 외국인 근로자 한랭질환 예방 안전보건교육 · protected release checkpoint (2026-11-17)

## Owner intent and boundaries
- EKODI Education's existing service `https://ekodi.kr/edu/` owns this public course entry; do not create a platform, subdomain, new persistent storage, or an admin privilege path.
- Register one 24-slide industrial cold-stress training course sourced from a user-provided 2026 산업안전상생재단 PPTX.
- The original Office PPTX and native Google Slides are stored in owner-private Google Drive; **do not expand Drive sharing or publicly expose source bytes**.
- The classroom web page links to the private editor/presenter. Its Google iframe may require Google sign-in; authenticated fallback link is mandatory.
- Original source has internal textual inconsistencies on slides 13, 20, 21, and 22. Preserve source, show review notice and do not silently rewrite occupational safety claims.

## Official provenance / CI continuity
- Original source work #9834 was superseded by orchestrator-issued #9835 (branch `ai/chatgpt/orch_recovery_597ea8466c984148322a8a9b1904af9c`).
- Source task `edu-cold-safety-20261117`; issued recovery task `orch_recovery_597ea8466c984148322a8a9b1904af9c`.
- The initial Education workflow found one genuine failed regression: two independent historical assertions counted 11 homepage cards despite addition of a 12th course. Corrected both on the official branch, commit `8e1eb2016599b0d1ca722c5dacdcaad16714d605`.
- On that genuine head all nine required workflow groups completed with conclusion `success`, including Education staging and full CI.
- Central protected-main synchronization subsequently advanced the official recovery branch to `a23ae2c830d7e25e54887908e9c48cf7946ed689`; bot-created check runs reported `action_required`, which are **not** accepted as genuine CI passes.
- This documentation-only checkpoint is an authentic, author-initiated commit request to rerun normal required validations on the **latest exact official branch HEAD**. It changes no application runtime, authorization, secrets, Cloudflare routes, or release authority.

## Mandatory acceptance
1. Genuine current-head CI, EKODI Orchestration Gate, constitutional/security and conflict checks.
2. Education isolated staging deployment successful.
3. Protected orchestrator merger with canonical receipt; no manual bypass or direct production deploy.
4. Guarded Education production release, then synthetic desktop/mobile canaries at 320/390/768/1366/1440 pixels.
5. Real `https://ekodi.kr/edu/study/cold-safety-2026/` responds with expected title, presenter/editor URLs, viewer CSP frame-src and ownership notices; normal `/edu/` and `/edu/study/` continue functioning.
6. Never report production completion without authoritative real-route verification and logs.
