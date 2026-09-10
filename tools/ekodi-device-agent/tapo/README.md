# EKODI Tapo Edge Bridge

TP-Link Tapo cameras are integrated as an EKODI device capability, not as a separate privileged cloud.

Security boundary:
- Tapo Camera Account, RTSP URL and local camera IP stay on the Edge Bridge.
- EKODI Cloud receives only sanitized device metadata and an HTTPS bridge origin.
- The gateway can execute only `camera.live.start`.
- Each browser stream uses a short-lived 3-minute session.
- The local HTTP bridge binds to `127.0.0.1`; publish it only through an authenticated HTTPS tunnel.
- Never port-forward RTSP/ONVIF directly to the internet.

Basic flow:
1. In Admin > 실행 인프라, create a Tapo IoT Bridge enrollment.
2. On a PC or small server in the same LAN as the cameras, run the generated enrollment command.
3. Configure an HTTPS tunnel origin under an allowed EKODI host.
4. Add each camera locally with `camera-add`.
5. Run `node index.mjs start`.

Diagnostics:
- `node index.mjs doctor`
- `node index.mjs self-test`

`self-test` uses FFmpeg's synthetic video source and verifies the same local HTTP/MJPEG stream path without a physical camera.
