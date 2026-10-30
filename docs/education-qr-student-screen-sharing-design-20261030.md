# EKODI Education QR student screen sharing

Goal: a protected instructor creates a temporary QR room, learners join under display names, instructor selects one learner, and only that learner may choose to share their screen. Stopping or switching is immediate and consensual.

Constraints: no automatic phone capture, no recording, no unauthenticated instructor control; QR may only invite learners. Up to 30 participants; one sender at a time; max 2 hours. Native iOS/Android support is required for unsupported mobile browser whole-screen capture, with image-upload fallback. Cloudflare Realtime SFU is already configured; prefer that existing service for scalable secure media delivery, and a bounded room coordinator for attendance and selection. Require protected CI, staging and real mobile device verification before production activation.
