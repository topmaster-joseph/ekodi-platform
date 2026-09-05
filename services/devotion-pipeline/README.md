# EKODI Devotion Pipeline

`ekodi.devotion-pipeline` is the tenant-neutral production conveyor between script content and a rendered devotional artifact.

## Boundary

The pipeline coordinates replaceable ports only:
- Devotion Voice
- Devotion Assets
- Devotion Renderer

It does not know EKODI Church, EKODI Mission, YouTube channels, Google Drive folders, admin authentication, Gemini internals, or FFmpeg internals.

## Identity and idempotency

Every logical render is identified by:
`workspace_id + batch_key + item_id + render_version`

The result record is stored in Devotion Assets. If the same identity is requested again, the stored result is returned without another TTS or render call.

If rendering fails after voice synthesis, the stored WAV is reused on retry instead of generating speech twice.
## Flow

```text
Devotion Studio
      |
Devotion Pipeline
  |       |       |
Voice   Assets  Renderer
  |       |       |
 WAV   records    MP4
      |
separate Publisher adapter
```

The HTTP service exposes `POST /v1/process` and `GET /health`.

## Fail-closed errors

- `PIPELINE_VOICE_DISCONNECTED`
- `PIPELINE_ASSET_STORE_DISCONNECTED`
- `PIPELINE_RENDERER_DISCONNECTED`

No dependency outage is represented as a successful render.

## Publication boundary

Publishing is deliberately outside this service. EKODI Church and EKODI Mission are configured only as publication targets in the integration layer after a render result exists.
