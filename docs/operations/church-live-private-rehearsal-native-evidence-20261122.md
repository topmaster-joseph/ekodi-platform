# Church LIVE local rehearsal — first-party native proof checkpoint

## Scope
Canonical production URL: `https://ekodi.kr/live/church/?mode=studio&activity=event`.
This recovery contains a read-only, headless Chromium fake-device verification workflow and its tests. It must never start a public broadcast, create a room, mutate a payment, use a personal Opera session, or leak raw video/artifacts.

## Source and actual browser evidence
- Source PR: `ekodi-platform#10141`; official guarded recovery PR `#10150`.
- Source HEAD: `c4ebeeb53dc2d42c4dcc9737415af5f83d525c7c`.
- Genuine CI: `44924435721` success; AI orchestration, governance, security, Supabase, Cloudflare and parallel guard success.
- Actual first-party isolated browser workflow: `44924435826` success, not a mock assertion of remote deployment.
- Browser report: `{"test":"fake-device-local-rehearsal","publicBroadcastStarted":false,"serverMutations":0,"desktopMonitorWidth":460,"mobileMonitorWidth":374,"videoTracks":1,"audioTracks":1,"recordedBytes":381259,"decodedWidth":1280,"decodedHeight":720,"playedSeconds":0.79,"mediaType":"video/webm;codecs=vp8,opus","blockedBackgroundRequests":3,"status":"pass"}`.
- Three unrelated Cloudflare challenge/RUM and visit-metrics HTTP mutations were intercepted and **blocked**, not delivered. No realtime broadcast writes were attempted. All other unexpected non-GET API mutation attempts fail the test.
- The browser is closed in `finally` and the actual recorded audio/video blob is not uploaded to GitHub; a sanitized JSON report is retained temporarily.

## Integration and release safeguards
- Native script: `scripts/verify-church-local-rehearsal-native.mjs`.
- GitHub workflow: `.github/workflows/verify-church-live-private-rehearsal.yml`.
- Regression contract: `test/church-live-private-rehearsal-native-contract.test.mjs`.
- The workflow runs on same-repository PR review, protected main source push, successful main Site Core release dispatch, or explicit manual dispatch; no deployment secrets, owner identity handoff or write permissions.
- Release only via authenticated EKODI orchestrator provenance, genuine CI, protected merge and post-release browser evidence. `action_required` placeholder checks are not success.
- This proves actual production browser playback with **synthetic** A/V devices, not the user's hardware microphone fidelity or public SFU viewer reception.
- Do not run the public synthetic E2E automatically. Never open tabs in the user's personal Opera.
- Keep central tracking issue `#10054` open until operational status and applicable hardware tests are recorded.
