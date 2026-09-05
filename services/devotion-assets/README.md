# EKODI Devotion Assets

`ekodi.devotion-assets` is a standalone, provider-neutral binary/metadata storage service for devotional production artifacts (voice WAV files, rendered MP4 metadata records, and other batch artifacts).

It is intentionally separate from Devotion Studio, Devotion Pipeline, Devotion Voice, and Devotion Renderer. This service only stores and retrieves opaque assets by `(workspace_id, asset_key)`; it does not know about churches, missions, YouTube, or Google Drive.

## Responsibilities

- accept `PUT /v1/assets/:assetKey?workspace_id=...` (raw body bytes + `x-asset-metadata` JSON header)
- accept `GET /v1/assets/:assetKey?workspace_id=...`
- isolate every asset by `workspace_id` so two workspaces can never collide, even with identical `asset_key`s
- fail closed with `ASSET_STORE_NOT_CONNECTED` when the configured store adapter is not ready

## Non-responsibilities

The assets core does not:
- know EKODI Church or EKODI Mission
- call the Google Drive API or bundle a Drive SDK
- call the YouTube API
- run FFmpeg or generate voice audio
- authenticate EKODI admins

Those all live in separate services/adapters.

## Adapters

- `src/adapters/filesystem-store.js` — local/dev adapter. Persists each asset under `ASSET_STORE_DIR/<workspace_id>/<asset_key>.bin` (+ a `.json` metadata sidecar). Path segments are sanitized so an `asset_key` can never escape its workspace directory.
- `src/adapters/http-storage-gateway.js` — generic HTTP storage-gateway **contract**. It speaks a provider-neutral `PUT/GET /v1/objects/:workspace_id/:asset_key` protocol over HTTP. A real remote object store (including a Shared Drive-backed gateway) can implement that contract behind the scenes, but the core and this adapter never import a Google Drive SDK or know about Drive folder IDs.

Select the adapter at the deployment boundary via `STORAGE_GATEWAY_ENDPOINT` (server.js falls back to the filesystem adapter when unset).

## API

`GET /health` — returns store readiness.

`PUT /v1/assets/:assetKey?workspace_id=...` — body is raw asset bytes; `x-asset-metadata` header carries a JSON metadata object. Authorization uses `ASSET_SERVICE_KEY` when configured.

`GET /v1/assets/:assetKey?workspace_id=...` — returns raw bytes with `x-asset-metadata` and `x-asset-stored-at` response headers, or `404 ASSET_NOT_FOUND`.

## Integration model

```text
Devotion Pipeline (Voice -> Assets -> Renderer orchestrator)
                     |
          Devotion Assets HTTP API
                     |
              store adapter
        (filesystem | http-storage-gateway)
```

Devotion Studio and Devotion Pipeline are the only intended callers. Publisher/YouTube adapters are never wired into this service.
