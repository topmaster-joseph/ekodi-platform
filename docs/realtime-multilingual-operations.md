# EKODI Realtime multilingual operations

The current multilingual Live path is deliberately human-interpretation-first.

- The host selects the original audio language and the interpretation languages before creating the room.
- The existing Realtime entitlement policy limits the number of requested interpretation languages.
- Each selected language receives a room-scoped interpreter link. An authorized tenant operator opens that link and publishes microphone audio as a `translation` track with an explicit language code.
- Viewers stay anonymous when the room allows it and can switch among the audio languages exposed by the active room while video tracks remain unchanged.
- AI automatic interpretation is not enabled by this release. The Live UI states this explicitly so a planned AI plane cannot be mistaken for an operational capability.
- Generic tenant Live uses a two-minute authentication-loop guard. Failed or repeated central-auth handoffs stop on the Live entry instead of cycling between Auth and Studio.

Canonical tenant Live paths remain beneath `https://ekodi.kr/<service>/live/`; no new first-party subdomain is introduced.
