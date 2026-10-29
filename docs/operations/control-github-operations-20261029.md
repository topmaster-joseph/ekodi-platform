# EKODI canonical Control Github operations

Issue #6630. The AI operations panel and the standalone /admin/control are different views. This change places a direct GitHub operations tab into the canonical Control UI.

The tab loads authenticated GET /api/control/ai/v8/github only when opened or manually refreshed. The backend requires super_admin and ai:read. The UI displays real observation jobs and labels unconnected GitHub quota measurements as unknown, never claiming a successful deployment. Existing release and human gates remain mandatory.

Rollout: protected CI, protected Site Core deployment, signed Webhook/Cloudflare secret provisioning, approved D1 migration and verified super-admin end-to-end test. No GitHub write or production action is issued by the tab.
