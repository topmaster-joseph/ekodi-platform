# EKODI Devotion Studio

`ekodi.devotion-studio` is an independently deployable, tenant-neutral service for devotional content production, video render orchestration, and publication scheduling.

## Boundary

This module does **not** belong to EKODI Church, EKODI Mission, the admin UI, or any individual workspace. Those products connect through adapters.

Core inputs are generic:
- `workspace_id`
- `batch_key`
- devotional items
- publication targets
- render format

Core code must not contain organization names, YouTube channel IDs, Google Drive folder IDs, EKODI admin-session logic, or a mandatory database vendor.

## Internal layout

- `src/service.js`: orchestration/business rules
- `src/http-handler.js`: portable HTTP contract
- `src/adapters/*`: replaceable provider adapters
- `test/*`: isolation and fail-closed contracts
- `service.manifest.json`: stable service identity and interfaces

## Integration model

```text
EKODI Admin / Church / Mission / another workspace
                     |
              platform adapter
                     |
          Devotion Studio HTTP API
              /       |       \
       repository   renderer  publisher
          adapter    adapter    adapter
```

For the current EKODI rollout, `integrations/devotion-studio/ekodi-september-2026.js` contains the Church/Mission-specific connection package. It is deliberately outside this service core.

## Production connection variables

The EKODI platform adapter expects server-side references such as:
- `DEVOTION_STUDIO_ENDPOINT`
- `DEVOTION_STUDIO_KEY`
- `DEVOTION_STUDIO_WORKSPACE_ID`
- `DEVOTION_STUDIO_CHURCH_TARGET_REF`
- `DEVOTION_STUDIO_MISSION_TARGET_REF`

Provider credentials belong to the provider adapter/deployment environment, never to browser code or the service core.

## Deployment rule

Devotion Studio must be deployable, replaceable, scaled, failed, and upgraded without redeploying EKODI Church or EKODI Mission. A workspace disconnect must not stop the service or affect other workspaces.
