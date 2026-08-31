# EKODI Devotional Automation v1

## Purpose

Turn a monthly Bible-passage plan into EKODI-owned 30-second devotional videos, package the same core content for 에코디교회 and 에코디선교회, and pre-upload each video to YouTube as private with a scheduled `publishAt` time.

## Control plane

`admin.ekodi.kr` → `AI·자동화` → `콘텐츠 자동화`

The admin surface shows the September 2026 30-entry series, script status, render status, two channel schedules, executor readiness, and per-entry edit/render/schedule actions.

Control API namespace: `https://api.ekodi.kr/api/control/devotional/*`

D1 stores operational state only:
- `devotional_settings`
- `devotional_entries`
- `devotional_jobs`

The September seed is deterministic and provider-independent. AI provider failure must not erase scripts or queue state.

## Execution plane

`services/devotional-executor` is a replaceable trusted executor. It is intentionally outside the Cloudflare Worker runtime because Full HD FFmpeg rendering is CPU/file-system work.

Pipeline:
1. Gemini 2.5 Flash Preview TTS creates Korean narration.
2. FFmpeg creates 1080×1920, 30 fps, H.264/AAC, 30-second MP4 files.
3. Two variants are rendered with separate church/mission branding.
4. A local manifest stores both variant paths and YouTube metadata.
5. The executor sends a bearer-authenticated callback to the Control API.
6. After admin scheduling, the executor uploads both files to their configured YouTube OAuth channels as private videos with future `publishAt` values.
7. The callback records video IDs and scheduled UTC times in D1.

## YouTube channel authorization

The two channels use separate refresh tokens and may share one Google OAuth client. Run the one-time helper from `services/devotional-executor` for each channel owner account, then store the resulting refresh tokens only in the executor secret store.

Required executor secrets:
- `GEMINI_API_KEY`
- `DEVOTIONAL_CALLBACK_TOKEN`
- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `YOUTUBE_CHURCH_REFRESH_TOKEN`
- `YOUTUBE_MISSION_REFRESH_TOKEN`

Secrets are never stored in browser code or GitHub.

## Storage

D1 is not the canonical artifact store. Final retained records belong in Google Workspace Shared Drive EKODI through the Storage Gateway. The current v1 executor retains local MP4 files for the render-to-publish handoff and the platform keeps durable content/job metadata. A production promotion must add or confirm the approved large-object staging-to-Shared-Drive path for final MP4 retention because the existing `/api/storage/v1/records` inline payload contract is limited to 8 MiB.

## Production gates

Do not promote this feature to production until all of the following are true:
1. root `npm test` and source validation pass;
2. PR/staging admin UI is verified;
3. executor `/health` reports FFmpeg, FFprobe, Gemini and both YouTube channel tokens ready;
4. one devotional renders successfully in staging;
5. one private YouTube test upload is verified on each channel;
6. scheduled publishing uses future times and never silently publishes immediately;
7. the approved large-video durable storage route is confirmed;
8. the administrator explicitly approves production promotion.

## Default schedule

- timezone: `Asia/Seoul`
- 에코디교회: 06:00
- 에코디선교회: 07:00

The schedule is editable in the admin page before queueing YouTube publication.