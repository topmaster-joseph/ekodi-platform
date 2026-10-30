# EKODI Education QR student screen sharing

Goal: a protected instructor creates a temporary QR room, learners join under display names, instructor selects one learner, and only that learner may choose to share their screen. Stopping or switching is immediate and consensual.

Constraints: no automatic phone capture, no recording, no unauthenticated instructor control; QR may only invite learners. Up to 30 participants; one sender at a time; max 4 hours (covers the three-hour farmer class plus setup time). Native iOS/Android support is required for unsupported mobile browser whole-screen capture, with image-upload fallback. Cloudflare Realtime SFU is already configured; prefer that existing service for scalable secure media delivery, and a bounded room coordinator for attendance and selection. Require protected CI, staging and real mobile device verification before production activation.

## Protected convergence checkpoint (2026-10-31 KST)

- Owner-authored source head `5062f456e2951f7dbaf068fc0523b332575c8d42` completed authentic required `test` and `EKODI AI Orchestration Gate` with **success**. Education isolated staging deploy also passed.
- EKODI Orchestrator synchronized to `7f5831f50f8fc386a8e8cd2fcf5daab36f4a652a`, yielding bot-authored `action_required` checks that are not a successful protected gate.
- This documentation-only owner checkpoint requests authentic full CI on the latest official orchestrator branch. It does NOT bypass, synthesize, or mark checks successful, issue a deploy, or weaken permissions, instructor authentication, QR consent, same-origin policy, CSP or room expiry.
- Four-hour room expiry covers the full three-hour course; screen-share data remains ephemeral and never recorded. The secure invite secret lives in the URL fragment and is removed after receipt.
- Native real-production QR browser acceptance is wired into the existing guarded Education release workflow; it must pass after protected merge before claiming the feature live. Real Android whole-screen support is not proven through mobile browser; allow explicit still-image fallback, and separately validate native mobile casting before claiming Android mirroring.
