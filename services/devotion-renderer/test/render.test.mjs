import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFfmpegArgs, renderBatch, ffmpegAvailable } from '../src/render.js';

const item = {
  id: '01',
  passage: '신명기 14:22-29',
  script: '받은 복은 흘려보낼 때 하나님의 복이 됩니다.',
  metadata: {
    duration_seconds: 1,
    caption_segments: [{ start: 0, end: 1, text: '받은 복은 흘려보냅니다.' }]
  }
};

test('FFmpeg plan targets vertical H.264/AAC output', () => {
  const args = buildFfmpegArgs({
    item,
    outputPath: '/tmp/out.mp4',
    subtitlePath: '/tmp/captions.ass',
    format: { width: 1080, height: 1920, fps: 30 }
  });
  const joined = args.join(' ');
  assert.match(joined, /scale=1080:1920/);
  assert.match(joined, /crop=1080:1920/);
  assert.match(joined, /-c:v libx264/);
  assert.match(joined, /-c:a aac/);
  assert.match(joined, /-r 30/);
  assert.match(joined, /subtitles=/);
});

test('renderer core contains no workspace-specific organization dependency', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../src/render.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(source, /에코디교회|에코디선교회|YouTube|Google Drive|auth-worker/);
});

test('FFmpeg smoke renders a real MP4 when ffmpeg is installed', { timeout: 30000 }, async t => {
  if (!(await ffmpegAvailable())) return t.skip('ffmpeg is not installed in this runner');
  const outputDir = await mkdtemp(join(tmpdir(), 'devotion-render-test-'));
  try {
    const result = await renderBatch({
      job: { id: 'job-1', payload: { format: { width: 360, height: 640, fps: 24, crf: 28 } } },
      batch: { workspace_id: 'workspace-test', batch_key: 'ci', items: [item] },
      outputDir,
      fontName: 'DejaVu Sans'
    });
    assert.equal(result.artifacts.length, 1);
    const info = await stat(result.artifacts[0].path);
    assert.ok(info.size > 1000, `rendered MP4 too small: ${info.size}`);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
