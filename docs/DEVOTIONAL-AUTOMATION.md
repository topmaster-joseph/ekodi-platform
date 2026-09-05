# EKODI Daily Devotional Automation

## Goal
Turn a monthly Bible-reading plan into independently written 30-second devotional videos, package each master for one or more publication targets, retain durable artifacts, and schedule publication without making the engine belong to a particular church, mission organization, workspace, or admin page.

## Independent service
The production engine is `ekodi.devotion-studio`, developed under `services/devotion-studio/` with its own manifest, tests, HTTP interface, and replaceable adapters.

EKODI Church and EKODI Mission are **integration targets**, not owners of the service. Their current September connection package lives under `integrations/devotion-studio/`, outside the service core.

## Platform control plane
`admin.ekodi.kr` exposes **AI·자동화 → 매일묵상**, but the panel is only a management client. The platform endpoint `/api/control/devotional` authenticates the EKODI administrator and proxies commands to Devotion Studio.

The platform adapter must not own devotional database tables, FFmpeg execution, YouTube channel credentials, or provider-specific persistence.

## Runtime flow
1. Admin submits or selects a monthly passage batch.
2. The platform adapter sends the generic batch to Devotion Studio with an immutable `workspace_id`.
3. Devotion Studio produces/coordinates original scripts and render jobs through replaceable adapters.
4. A renderer adapter dispatches FFmpeg work. Default target remains 1080x1920, 30fps, H.264/AAC.
5. An asset-store adapter persists retained scripts, metadata, and final media. Shared Drive EKODI can be one adapter target, not a core dependency.
6. Publication targets are resolved through publication adapters. YouTube is the current adapter, not a mandatory core provider.
7. Publication IDs, URLs, retry state, and failures are returned through the service contract and surfaced in admin.

## Current EKODI integration defaults
- target `church`: 에코디교회, 06:00 Asia/Seoul
- target `mission`: 에코디선교회, 07:00 Asia/Seoul

These labels and defaults live in the EKODI integration package, not in the Devotion Studio core.

## Server-side platform adapter configuration
- `DEVOTION_STUDIO_ENDPOINT`
- `DEVOTION_STUDIO_KEY`
- `DEVOTION_STUDIO_WORKSPACE_ID`
- `DEVOTION_STUDIO_CHURCH_TARGET_REF`
- `DEVOTION_STUDIO_MISSION_TARGET_REF`

Provider credentials and OAuth refresh tokens must never be committed or exposed to the browser.

## Safety / reliability
- EKODI admin control endpoints still require the existing administrator session.
- Platform GET requests may show a disconnected management state when Devotion Studio is not connected.
- Mutating actions fail closed until the independent service is connected.
- Render actions fail closed until a renderer adapter reports ready.
- Publication actions fail closed until the selected publication adapter reports ready.
- Core records are isolated by immutable `workspace_id` and `batch_key`.
- Idempotency must be enforced per workspace/content/publication target before production YouTube upload is enabled.

## Deployment boundary
Devotion Studio must have an independent deployment lifecycle. Church, Mission, Admin, renderer, storage and YouTube adapters may all be replaced or redeployed independently. A failure or disconnect in one workspace or publication target must not stop other workspaces or the service itself.
