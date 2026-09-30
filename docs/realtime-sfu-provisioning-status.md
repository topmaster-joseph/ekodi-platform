# Realtime SFU production prerequisite

The guarded production release attempts Cloudflare Realtime SFU provisioning with the existing production Cloudflare credential. Provisioning is fail-closed: if that credential does not carry Calls Write, the release stops before claiming Live media readiness.

Operational completion requires both:
1. a direct Cloudflare SFU session probe succeeds; and
2. `https://ekodi.kr/api/realtime/health` reports `providerConfigured:true`.
