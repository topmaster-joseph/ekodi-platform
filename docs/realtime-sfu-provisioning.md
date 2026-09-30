# EKODI Realtime SFU provisioning

Production Realtime provider credentials are created only inside the guarded Control API release lane.

The release must:
- pass EKODI AI Orchestration Gate and the normal Control staging gate first;
- preserve existing `REALTIME_SFU_APP_ID` and `REALTIME_SFU_APP_SECRET` when both already exist;
- create a Cloudflare Realtime SFU app only when the provider is not configured;
- prove the new app by creating an SFU session before storing Worker secrets;
- never print the app UID or secret;
- fail closed if the configured Cloudflare production credential lacks Calls Write;
- verify `https://ekodi.kr/api/realtime/health` reports `providerConfigured:true` after activation.

EKODI Church is the first production tenant, using `https://ekodi.kr/ekodichurch/live/` and the canonical root API at `https://ekodi.kr/api/realtime`.
