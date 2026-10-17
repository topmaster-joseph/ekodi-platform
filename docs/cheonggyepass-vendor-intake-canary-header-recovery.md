# 청계패스 외주사 접수 API 운영 헤더 검증 실패 — 원인 및 최소 수정 (2026-10-17)

## 보호된 운영 실패 증거
- Approved source: [PR #5159](https://github.com/topmaster-joseph/ekodi-platform/pull/5159) at `8a4c87c9b88e0c79864f98fc2bdbe02f9c9818b6`.
- Orchestrator recovery and protected merge: [PR #5168](https://github.com/topmaster-joseph/ekodi-platform/pull/5168), main merge `f115a121babc286ca93872c61f4a5465104f09f5`.
- Control API staged and applied incremental D1 migration; Cloudflare Wrangler automatically created R2 quarantine bucket `ekodi-pass-vendor-quarantine`.
- Guarded Control API production run [39028549573](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/39028549573) **failed and successfully rolled back**: `/api/cheonggyepass/vendor-intake` returned expected 401 `REGION_AUTH_REQUIRED`, but the canonical Shared Site proxy normalized the cache header and did not provide the exact `private, no-store` string expected by its release manifest.
- This is **not** an authorization bypass. Public access still receives HTTP 401, and the canonical response's `no-store` directive prevents caching.

## Minimal correction
- Update exactly the Cheonggye Pass canary in `deploy/manifests/control-api.worker.json` from `cache-control: private, no-store` to `cache-control: no-store`.
- Keep HTTP 401, `REGION_AUTH_REQUIRED`, `nosniff`, `candidateVerify=false`, and rollback protections unchanged.
- The underlying `cheonggyepass-vendor-intake.js` handler still emits `Cache-Control: private, no-store`; the canonical proxy may normalize it to `no-store`.
- No DB schema changes, no storage access changes, no additional external vendor privileges, no payment activation.
- Guarded re-release must be performed only from an official EKODI Orchestrator-issued task, with exact-SHA owner approval, real CI, latest-main conflict checks, protected Control API staging, rollback protection and live endpoint verification.

## Unrelated remaining browser failure
- Shared Site Core deploy job succeeded. The repository-wide native mobile runtime-smoke failed because `/ekodibiz/seasonal-workers/mou` overflows width 390 px. This does not demonstrate a Cheonggye Pass functional failure, but the overall Site Core workflow must not be reported wholly green until that separate issue is resolved.
- Actual authenticated PC/mobile Cheonggye Pass ZIP/API submission evidence remains pending.
