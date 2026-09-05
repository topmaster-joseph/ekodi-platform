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
const defaultFont = () => process.platform === 'win32' ? 'Malgun Gothic' : 'Noto Sans CJK KR';
function splitForCaptions(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const sentences = raw.match(/[^.!?。！？]+[.!?。！？]?/gu)?.map(value => value.trim()).filter(Boolean) || [raw];
  const parts = [];
  for (const sentence of sentences) {
    if (sentence.length <= 34) { parts.push(sentence); continue; }
    const clauses = sentence.split(/(?<=[,，])\s*/u).map(value => value.trim()).filter(Boolean);
    if (clauses.length > 1) parts.push(...clauses);
    else {
      const words = sentence.split(/\s+/u);
      let line = '';
      for (const word of words) {
        if (line && `${line} ${word}`.length > 30) { parts.push(line); line = word; }
        else line = line ? `${line} ${word}` : word;
      }
      if (line) parts.push(line);
    }
  }
  return parts.slice(0, 7);
}

function autoCaptionSegments(item, duration) {
  const parts = splitForCaptions(item.script || item.passage);
  if (!parts.length) return [];
  const start = 4.1;
  const end = Math.max(start + 1, duration - 3.2);
  const usable = end - start;
  const totalWeight = parts.reduce((sum, part) => sum + Math.max(8, part.length), 0);
  let cursor = start;
  return parts.map((text, index) => {
    const weight = Math.max(8, text.length);
    const span = index === parts.length - 1 ? end - cursor : usable * (weight / totalWeight);
    const segment = { start: cursor, end: Math.min(end, cursor + span), text };
    cursor = segment.end;
    return segment;
  }).filter(segment => segment.end > segment.start);
}

function captionSegments(item, duration) {
  const segments = item.metadata?.caption_segments;
  if (Array.isArray(segments) && segments.length) {
    return segments.map(segment => ({
      start: Math.max(0, Number(segment.start) || 0),
      end: Math.min(duration, Math.max(Number(segment.end) || duration, Number(segment.start) || 0)),
      text: String(segment.text || '')
    })).filter(segment => segment.text && segment.end > segment.start);
  }
  return autoCaptionSegments(item, duration);
}

function createAss(item, duration, fontName = defaultFont()) {
  const meta = item.metadata || {};
  const title = String(meta.title || '').trim();
  const passage = String(item.passage || '').trim();
  const keySentence = String(meta.key_sentence || '').trim();
  const brand = String(meta.brand_label || 'EKODI').trim();
  const outro = String(meta.outro_text || '말씀이 오늘의 삶이 되도록').trim();
  const events = [];
  if (title) events.push(`Dialogue: 2,0:00:00.45,0:00:04.10,Title,,0,0,0,,${assText(title)}`);
  if (passage) events.push(`Dialogue: 2,0:00:00.65,0:00:04.10,Passage,,0,0,0,,${assText(passage)}`);
  for (const segment of captionSegments(item, duration)) {
    events.push(`Dialogue: 1,${assTime(segment.start)},${assTime(segment.end)},Caption,,0,0,0,,${assText(segment.text)}`);
  }
  if (keySentence) {
    const keyStart = Math.max(21.8, duration - 6.1);
    const keyEnd = Math.max(keyStart + 1, duration - 2.9);
    events.push(`Dialogue: 3,${assTime(keyStart)},${assTime(keyEnd)},Key,,0,0,0,,${assText(keySentence)}`);
  }
  const outroStart = Math.max(0, duration - 2.85);
  events.push(`Dialogue: 4,${assTime(outroStart)},${assTime(duration)},OutroBrand,,0,0,0,,${assText(brand)}`);
  events.push(`Dialogue: 4,${assTime(outroStart + 0.25)},${assTime(duration)},OutroText,,0,0,0,,${assText(outro)}`);
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\nScaledBorderAndShadow: yes\nYCbCr Matrix: TV.709\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Title,${fontName},70,&H00FFFFFF,&H000000FF,&H78000000,&H00000000,-1,0,0,0,100,100,-1,0,1,2,0,8,90,90,185,1\nStyle: Passage,${fontName},36,&H00E7D7B0,&H000000FF,&H60000000,&H00000000,0,0,0,0,100,100,1,0,1,2,0,8,100,100,315,1\nStyle: Caption,${fontName},58,&H00FFFFFF,&H000000FF,&HA0000000,&H00000000,-1,0,0,0,100,100,0,0,1,4,1,2,95,95,285,1\nStyle: Key,${fontName},62,&H00F1DFAF,&H000000FF,&HA0000000,&H00000000,-1,0,0,0,100,100,0,0,1,4,1,5,110,110,0,1\nStyle: OutroBrand,${fontName},56,&H00FFFFFF,&H000000FF,&H80000000,&H00000000,-1,0,0,0,100,100,2,0,1,3,1,5,100,100,0,1\nStyle: OutroText,${fontName},32,&H00E7D7B0,&H000000FF,&H70000000,&H00000000,0,0,0,0,100,100,1,0,1,2,0,5,100,100,0,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n${events.join('\n')}\n`;
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
  else args.push('-f', 'lavfi', '-i', `gradients=s=${width}x${height}:r=${fps}:c0=0x061723:c1=0x164653:c2=0xC69B59:c3=0x0A1D2A:n=4:type=linear:speed=0.0015:d=${duration}`);

  if (audioPath) args.push('-i', audioPath);
  else args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');

  const escapedSubtitle = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  const filters = [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    'eq=saturation=0.92:contrast=1.04:brightness=-0.015',
    'vignette=PI/5',
    `drawbox=x=54:y=${Math.round(height * 0.665)}:w=${width - 108}:h=${Math.round(height * 0.235)}:color=black@0.18:t=fill:enable='between(t,4.0,27.15)'`,
    `subtitles='${escapedSubtitle}'`
  ];
  args.push('-vf', filters.join(','));
  args.push(
    '-t', String(duration),
    '-r', String(fps),
    '-c:v', 'libx264',
    '-preset', String(format.preset || 'medium'),
    '-crf', String(format.crf || 18),
    '-profile:v', 'high',
    '-level:v', '4.1',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', String(format.audio_bitrate || '192k'),
    '-ar', '48000',
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
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
    await writeFile(subtitlePath, createAss(effectiveItem, duration, fontName || defaultFont()), 'utf8');
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
  try { await runProcess(ffmpegPath, ['-version']); return true; }
  catch { return false; }
}
