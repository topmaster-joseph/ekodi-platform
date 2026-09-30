# EKODI Daily Devotional Automation

## Goal
Turn a monthly Bible-reading plan into independently written 30-second devotional videos, package each master for EKODI Church and EKODI Mission, retain durable artifacts in Shared Drive EKODI, and schedule each variant on its assigned YouTube channel.

## Control plane
`admin.ekodi.kr` exposes **AI·자동화 → 매일묵상**. The panel shows source passages, render state, channel connection state, scheduled/published state, and failures. A disconnected provider must be shown as disconnected rather than simulated as complete.

## Runtime flow
1. Seed monthly passages into D1 operational state.
2. Produce an original devotional script from the Bible passage. QTIN commentary is not copied.
3. Dispatch a render job to the external FFmpeg render node.
4. Render a 1080x1920, 30fps, H.264/AAC master and channel end cards.
5. Persist retained scripts, metadata, and final video artifacts through the EKODI Storage Gateway into Shared Drive EKODI.
6. Upload channel variants as private YouTube videos and set `publishAt` for scheduled publication.
7. Record YouTube video IDs, URLs, publication state, and retry state in the operational database.

## Channel defaults
- `church`: 에코디교회, 06:00 Asia/Seoul
- `mission`: 에코디선교회, 07:00 Asia/Seoul

## Server-only configuration
- `DEVOTIONAL_RENDER_ENDPOINT`
- `DEVOTIONAL_RENDER_KEY`
- YouTube OAuth client credentials and refresh tokens for each channel
- Storage Gateway credentials/bindings already governed by the EKODI storage layer

Provider and OAuth secrets must never be committed or exposed to the browser.

## Safety / reliability
- Control endpoints require the existing EKODI administrator session.
- Generation is disabled until a render endpoint and key are configured.
- Channel status remains `not_connected` until OAuth is actually completed.
- Content IDs must be idempotent per month/day/channel to prevent duplicate uploads.
- YouTube should receive videos ahead of time with scheduled publication, so a later EKODI outage does not cancel already-scheduled releases.

## Deployment boundary
Cloudflare handles control/state/orchestration. FFmpeg rendering and large media upload run on a separate authorized render node or container service. This avoids pretending Cloudflare Worker runtime is a general video workstation.