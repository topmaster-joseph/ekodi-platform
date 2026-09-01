import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const safeName = value => String(value || 'item').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
const assTime = seconds => {
  const total = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const cs = Math.floor((total - Math.floor(total)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
};
const assText = value => String(value || '')
  .replace(/\\/g, '\\\\')
  .replace(/\{/g, '\\{')
  .replace(/\}/g, '\\}')
  .replace(/\r?\n/g, '\\N');

function captionSegments(item, duration) {
  const segments = item.metadata?.caption_segments;
  if (Array.isArray(segments) && segments.length) {
    return segments.map(segment => ({
      start: Math.max(0, Number(segment.start) || 0),
      end: Math.min(duration, Math.max(Number(segment.end) || duration, Number(segment.start) || 0)),
      text: String(segment.text || '')
    })).filter(segment => segment.text && segment.end > segment.start);
  }
  const fallback = String(item.script || item.passage || '').trim();
  return fallback ? [{ start: 0, end: duration, text: fallback }] : [];
}

function createAss(item, duration, fontName = 'Noto Sans CJK KR') {
  const dialogues = captionSegments(item, duration).map(segment =>
    `Dialogue: 0,${assTime(segment.start)},${assTime(segment.end)},Default,,0,0,0,,${assText(segment.text)}`
  ).join('\n');
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Default,${fontName},58,&H00FFFFFF,&H000000FF,&H80000000,&H50000000,0,0,0,0,100,100,0,0,1,3,1,2,90,90,260,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n${dialogues}\n`;
}

function runProcess(command, args, { cwd } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}: ${stderr.slice(-4000)}`));
    });
  });
}

export function buildFfmpegArgs({ item, outputPath, subtitlePath, format = {} }) {
  const width = Number(format.width || 1080);
  const height = Number(format.height || 1920);
  const fps = Number(format.fps || 30);
  const duration = Math.max(1, Number(item.metadata?.duration_seconds || 30));
  const backgroundPath = String(item.metadata?.background_path || '').trim();
  const audioPath = String(item.metadata?.audio_path || '').trim();
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];

  if (backgroundPath) args.push('-stream_loop', '-1', '-i', backgroundPath);
  else args.push('-f', 'lavfi', '-i', `color=c=0x101820:s=${width}x${height}:r=${fps}:d=${duration}`);

  if (audioPath) args.push('-i', audioPath);
  else args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');

  const escapedSubtitle = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  args.push(
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},subtitles='${escapedSubtitle}'`,
    '-t', String(duration),
    '-r', String(fps),
    '-c:v', 'libx264',
    '-preset', String(format.preset || 'veryfast'),
    '-crf', String(format.crf || 20),
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', String(format.audio_bitrate || '128k'),
    '-ar', '48000',
    '-movflags', '+faststart',
    outputPath
  );
  return args;
}

export async function renderItem({ item, workspaceId, batchKey, format, outputDir, ffmpegPath = 'ffmpeg', fontName }) {
  const tempDir = await mkdtemp(join(tmpdir(), 'ekodi-devotion-render-'));
  try {
    let effectiveItem = item;
    const inlineAudio = String(item.metadata?.audio_base64 || '').trim();
    if (inlineAudio && !item.metadata?.audio_path) {
      const audioPath = join(tempDir, 'voice.wav');
      await writeFile(audioPath, Buffer.from(inlineAudio, 'base64'));
      effectiveItem = { ...item, metadata: { ...item.metadata, audio_path: audioPath } };
    }
    const duration = Math.max(1, Number(effectiveItem.metadata?.duration_seconds || 30));
    const subtitlePath = join(tempDir, 'captions.ass');
    await writeFile(subtitlePath, createAss(effectiveItem, duration, fontName), 'utf8');
    await mkdir(outputDir, { recursive: true });
    const version = safeName(effectiveItem.metadata?.render_version || 'v1');
    const filename = `${safeName(workspaceId)}-${safeName(batchKey)}-${safeName(item.id)}-${version}.mp4`;
    const outputPath = resolve(outputDir, filename);
    const args = buildFfmpegArgs({ item: effectiveItem, outputPath, subtitlePath, format });
    await runProcess(ffmpegPath, args);
    return { item_id: String(item.id), path: outputPath, filename, duration_seconds: duration };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function renderBatch({ job, batch, outputDir = '/tmp/ekodi-devotion-renderer', ffmpegPath = 'ffmpeg', fontName }) {
  if (!job || !batch) throw new Error('job and batch are required');
  if (!batch.workspace_id || !batch.batch_key) throw new Error('batch workspace_id and batch_key are required');
  if (!Array.isArray(batch.items) || !batch.items.length) throw new Error('batch items are required');
  const artifacts = [];
  for (const item of batch.items) {
    artifacts.push(await renderItem({
      item,
      workspaceId: batch.workspace_id,
      batchKey: batch.batch_key,
      format: job.payload?.format || {},
      outputDir,
      ffmpegPath,
      fontName
    }));
  }
  return { job_id: String(job.id || ''), workspace_id: batch.workspace_id, batch_key: batch.batch_key, artifacts };
}

export async function ffmpegAvailable(ffmpegPath = 'ffmpeg') {
  try {
    await runProcess(ffmpegPath, ['-version']);
    return true;
  } catch {
    return false;
  }
}
