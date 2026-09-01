# EKODI Devotion Renderer

`ekodi.devotion-renderer.ffmpeg` is a standalone container service that turns prepared devotional assets into vertical MP4 files with FFmpeg.

It is intentionally separate from Devotion Studio. Devotion Studio orchestrates jobs; the renderer only renders.

## Responsibilities

- accept `POST /v1/render`
- render one MP4 per batch item
- default to 1080x1920, 30fps, H.264 + AAC
- burn ASS captions into the video
- use supplied `metadata.background_path` when available
- use supplied `metadata.audio_path` when available
- fail independently from the orchestration service

## Non-responsibilities

The renderer does not:
- write devotional scripts
- generate TTS
- generate stock/AI background media
- know EKODI Church or EKODI Mission
- authenticate EKODI admins
- upload to YouTube
- choose Google Drive folders

Those are separate adapters/services.

## API

`GET /health`

Returns FFmpeg readiness.

`POST /v1/render`

Authorization uses `RENDER_SERVICE_KEY` when configured. Body:

```json
{
  "job": {
    "id": "job-1",
    "payload": {
      "format": { "width": 1080, "height": 1920, "fps": 30 }
    }
  },
  "batch": {
    "workspace_id": "workspace-id",
    "batch_key": "2026-09",
    "items": [
      {
        "id": "01",
        "passage": "...",
        "script": "...",
        "metadata": {
          "duration_seconds": 30,
          "background_path": "/assets/background.mp4",
          "audio_path": "/assets/voice.wav",
          "caption_segments": [
            { "start": 0, "end": 4.5, "text": "..." }
          ]
        }
      }
    ]
  }
}
```

## Container

The Docker image installs FFmpeg and Noto CJK fonts. Output is written under `OUTPUT_DIR`, default `/data/output` in the container.
