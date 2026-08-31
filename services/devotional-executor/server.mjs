import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { GoogleGenAI } from '@google/genai';
import { google } from 'googleapis';

const PORT = Number(process.env.PORT || 8789);
const WORK_ROOT = path.resolve(process.env.DEVOTIONAL_WORK_ROOT || './work');
const CALLBACK_URL = process.env.DEVOTIONAL_CALLBACK_URL || 'https://api.ekodi.kr/api/control/devotional/executor/callback';
const CALLBACK_TOKEN = process.env.DEVOTIONAL_CALLBACK_TOKEN || '';
const GEMINI_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const GEMINI_VOICE = process.env.GEMINI_TTS_VOICE || 'Kore';
const FONT_NAME = process.env.DEVOTIONAL_FONT_NAME || 'Noto Sans CJK KR';
const BACKGROUND_VIDEO = process.env.DEVOTIONAL_BACKGROUND_VIDEO || '';
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || '';
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || '';
const CHANNELS = {
  church: {
    label: process.env.DEVOTIONAL_CHURCH_LABEL || '에코디교회',
    refreshToken: process.env.YOUTUBE_CHURCH_REFRESH_TOKEN || ''
  },
  mission: {
    label: process.env.DEVOTIONAL_MISSION_LABEL || '에코디선교회',
    refreshToken: process.env.YOUTUBE_MISSION_REFRESH_TOKEN || ''
  }
};

let workChain = Promise.resolve();
const enqueue = task => {
  workChain = workChain.then(task).catch(error => console.error('[devotional-executor]', error));
  return workChain;
};

function send(res, status, data) {
  res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' });
  res.end(JSON.stringify(data));
}

async function bodyJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 2_000_000) throw new Error('request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio:['ignore','pipe','pipe'], ...options });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}: ${stderr.slice(-1400)}`));
    });
  });
}

async function commandAvailable(command) {
  try { await run(command, ['-version']); return true; } catch { return false; }
}

function wavHeader(dataLength, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const blockAlign = channels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
}

async function geminiTts(text, outputPath) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = [
    '다음 한국어 묵상문을 차분하고 따뜻하며 또렷한 목회적 내레이션으로 읽어 주세요.',
    '과장하지 말고 자연스럽게, 전체 낭독이 약 27초가 되도록 약간 경쾌한 속도로 읽습니다.',
    '문장의 의미나 내용을 바꾸지 말고 묵상문만 읽어 주세요.',
    '',
    text
  ].join('\n');
  const result = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role:'user', parts:[{ text:prompt }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName:GEMINI_VOICE } } }
    }
  });
  const part = result?.candidates?.[0]?.content?.parts?.find(item => item?.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error('Gemini TTS returned no audio');
  const data = Buffer.from(part.inlineData.data, 'base64');
  const mime = String(part.inlineData.mimeType || 'audio/L16;codec=pcm;rate=24000');
  if (/wav/i.test(mime)) {
    await fsp.writeFile(outputPath, data);
    return;
  }
  const rate = Number(mime.match(/rate=(\d+)/i)?.[1] || 24000);
  await fsp.writeFile(outputPath, Buffer.concat([wavHeader(data.length, rate), data]));
}

async function audioDuration(file) {
  const { stdout } = await run('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file]);
  return Math.max(0.1, Number(stdout.trim()) || 0.1);
}

function assTime(seconds) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const centis = Math.floor((safe - Math.floor(safe)) * 100);
  return `${hours}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}.${String(centis).padStart(2,'0')}`;
}

function escapeAss(value) {
  return String(value || '').replace(/[{}]/g, '').replace(/\r?\n/g, '\\N');
}

function wrapKorean(value, max = 20) {
  const words = String(value || '').trim().split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > max && line) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines.join('\\N');
}

function sentences(text) {
  const parts = String(text || '').match(/[^.!?。！？]+[.!?。！？]?/g)?.map(item => item.trim()).filter(Boolean) || [];
  if (parts.length <= 6) return parts;
  const merged = [];
  for (const part of parts) {
    if (merged.length < 5) merged.push(part);
    else merged[merged.length - 1] += ` ${part}`;
  }
  return merged;
}

async function writeAss(file, job, brand) {
  const bodyParts = sentences(job.script);
  const start = 1.4;
  const end = 26.4;
  const totalWeight = bodyParts.reduce((sum, item) => sum + Math.max(1, item.length), 0) || 1;
  let cursor = start;
  const events = [];
  events.push(`Dialogue: 0,0:00:00.00,0:00:30.00,Header,,0,0,0,,${escapeAss(wrapKorean(`${job.date}  ${job.passage}`, 28))}`);
  events.push(`Dialogue: 0,0:00:00.00,0:00:30.00,Title,,0,0,0,,${escapeAss(wrapKorean(job.title, 18))}`);
  events.push(`Dialogue: 0,0:00:00.00,0:00:30.00,Footer,,0,0,0,,${escapeAss(brand)}`);
  for (const part of bodyParts) {
    const duration = (end - start) * Math.max(1, part.length) / totalWeight;
    const next = Math.min(end, cursor + duration);
    events.push(`Dialogue: 0,${assTime(cursor)},${assTime(next)},Body,,0,0,0,,${escapeAss(wrapKorean(part, 18))}`);
    cursor = next;
  }
  events.push(`Dialogue: 0,0:00:26.40,0:00:30.00,Core,,0,0,0,,${escapeAss(wrapKorean(job.core, 17))}`);
  const content = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nScaledBorderAndShadow: yes\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Header,${FONT_NAME},34,&H00E8EEF5,&H00FFFFFF,&H50000000,&H00000000,0,0,0,0,100,100,1,0,1,2,0,8,70,70,120,1\nStyle: Title,${FONT_NAME},64,&H00FFFFFF,&H00FFFFFF,&H70000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,8,90,90,225,1\nStyle: Body,${FONT_NAME},58,&H00FFFFFF,&H00FFFFFF,&H90000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,5,86,86,120,1\nStyle: Core,${FONT_NAME},62,&H00F3F7FB,&H00FFFFFF,&H90000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,5,80,80,120,1\nStyle: Footer,${FONT_NAME},30,&H00DCE5EF,&H00FFFFFF,&H50000000,&H00000000,0,0,0,0,100,100,1,0,1,2,0,2,70,70,100,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.join('\n')}\n`;
  await fsp.writeFile(file, content, 'utf8');
}

function ffmpegSubtitlePath(file) {
  return file.replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"\\'");
}

async function renderVariant(job, audioPath, assPath, outputPath) {
  const duration = await audioDuration(audioPath);
  const speed = Math.max(1, Math.min(2, duration / 27.0));
  const hasBackground = BACKGROUND_VIDEO && fs.existsSync(BACKGROUND_VIDEO);
  const inputArgs = hasBackground
    ? ['-stream_loop','-1','-i',BACKGROUND_VIDEO]
    : ['-f','lavfi','-i','color=c=0x0B1726:s=1080x1920:r=30:d=30'];
  const videoFilter = hasBackground
    ? `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,trim=duration=30,setpts=PTS-STARTPTS,eq=brightness=-0.12:saturation=0.78,vignette=PI/5,subtitles='${ffmpegSubtitlePath(assPath)}'[v]`
    : `[0:v]noise=alls=2:allf=t+u,vignette=PI/5,subtitles='${ffmpegSubtitlePath(assPath)}'[v]`;
  const filter = `${videoFilter};[1:a]atempo=${speed.toFixed(4)},apad=pad_dur=30,atrim=duration=30[a]`;
  await run('ffmpeg', [
    '-y', ...inputArgs, '-i',audioPath,
    '-filter_complex',filter,
    '-map','[v]','-map','[a]',
    '-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-r','30',
    '-c:a','aac','-b:a','160k','-movflags','+faststart','-t','30',outputPath
  ]);
}

function youtubeMetadata(job, variant) {
  if (variant === 'church') {
    return {
      title:`${job.title} | 오늘의 30초 말씀`.slice(0,100),
      description:`오늘의 말씀: ${job.passage}\n\n${job.core}\n\n#에코디교회 #매일묵상 #성경묵상 #Shorts`
    };
  }
  return {
    title:`${job.title} | 30초 삶의 묵상`.slice(0,100),
    description:`오늘의 말씀: ${job.passage}\n\n${job.core}\n\n말씀을 삶의 자리에서 살아내고 살려냅니다.\n\n#에코디선교회 #매일묵상 #말씀대로 #Shorts`
  };
}

async function callback(payload) {
  if (!CALLBACK_TOKEN) throw new Error('DEVOTIONAL_CALLBACK_TOKEN is not configured');
  const response = await fetch(CALLBACK_URL, {
    method:'POST',
    headers:{ 'content-type':'application/json', authorization:`Bearer ${CALLBACK_TOKEN}` },
    body:JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`callback failed: HTTP ${response.status}`);
}

async function renderJob(job) {
  const dir = path.join(WORK_ROOT, job.date || job.entryId);
  await fsp.mkdir(dir, { recursive:true });
  const audio = path.join(dir, 'narration.wav');
  const churchAss = path.join(dir, 'church.ass');
  const missionAss = path.join(dir, 'mission.ass');
  const churchVideo = path.join(dir, 'church.mp4');
  const missionVideo = path.join(dir, 'mission.mp4');
  const manifestPath = path.join(dir, 'manifest.json');
  try {
    await geminiTts(job.script, audio);
    await writeAss(churchAss, job, CHANNELS.church.label);
    await writeAss(missionAss, job, CHANNELS.mission.label);
    await renderVariant(job, audio, churchAss, churchVideo);
    await renderVariant(job, audio, missionAss, missionVideo);
    const manifest = {
      entryId:job.entryId,
      date:job.date,
      passage:job.passage,
      title:job.title,
      core:job.core,
      files:{ church:churchVideo, mission:missionVideo, audio },
      metadata:{ church:youtubeMetadata(job,'church'), mission:youtubeMetadata(job,'mission') },
      createdAt:new Date().toISOString()
    };
    await fsp.writeFile(manifestPath, JSON.stringify(manifest,null,2));
    await callback({ entryId:job.entryId, stage:'render', ok:true, videoPath:manifestPath });
  } catch (error) {
    await callback({ entryId:job.entryId, stage:'render', ok:false, error:String(error?.message || error) }).catch(()=>{});
    throw error;
  }
}

function localPublishIso(publishAt) {
  const local = String(publishAt?.local || '');
  const timezone = String(publishAt?.timezone || 'Asia/Seoul');
  if (!local) throw new Error('publishAt.local is missing');
  if (timezone === 'Asia/Seoul') return new Date(`${local}+09:00`).toISOString();
  throw new Error(`unsupported timezone: ${timezone}`);
}

function youtubeClient(refreshToken) {
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !refreshToken) throw new Error('YouTube OAuth credentials are not configured');
  const auth = new google.auth.OAuth2(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token:refreshToken });
  return google.youtube({ version:'v3', auth });
}

async function uploadVideo(variant, file, meta, publishAt) {
  const channel = CHANNELS[variant];
  const youtube = youtubeClient(channel.refreshToken);
  const result = await youtube.videos.insert({
    part:['snippet','status'],
    requestBody:{
      snippet:{ title:meta.title, description:meta.description, categoryId:'22', defaultLanguage:'ko' },
      status:{ privacyStatus:'private', publishAt:localPublishIso(publishAt), selfDeclaredMadeForKids:false }
    },
    media:{ body:createReadStream(file) }
  });
  if (!result.data?.id) throw new Error(`${variant} YouTube upload returned no video id`);
  return result.data.id;
}

async function scheduleJob(job) {
  try {
    const manifest = JSON.parse(await fsp.readFile(job.videoPath, 'utf8'));
    const churchPublish = job.channels?.church?.publishAt;
    const missionPublish = job.channels?.mission?.publishAt;
    const churchYoutubeId = await uploadVideo('church', manifest.files.church, manifest.metadata.church, churchPublish);
    const missionYoutubeId = await uploadVideo('mission', manifest.files.mission, manifest.metadata.mission, missionPublish);
    await callback({
      entryId:job.entryId,
      stage:'schedule',
      ok:true,
      churchYoutubeId,
      missionYoutubeId,
      churchPublishAt:localPublishIso(churchPublish),
      missionPublishAt:localPublishIso(missionPublish)
    });
  } catch (error) {
    await callback({ entryId:job.entryId, stage:'schedule', ok:false, error:String(error?.message || error) }).catch(()=>{});
    throw error;
  }
}

async function acceptBatch(body, res) {
  const jobs = Array.isArray(body.jobs) ? body.jobs : [];
  const action = String(body.action || '');
  if (!jobs.length) return send(res, 400, { error:'jobs are required' });
  if (!['render_batch','schedule_batch'].includes(action)) return send(res, 400, { error:'unsupported action' });
  send(res, 202, { accepted:jobs.length, action });
  enqueue(async () => {
    for (const job of jobs) {
      try {
        if (action === 'render_batch') await renderJob(job);
        else await scheduleJob(job);
      } catch (error) {
        console.error(`[${action}] ${job.entryId}`, error);
      }
    }
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    const [ffmpeg, ffprobe] = await Promise.all([commandAvailable('ffmpeg'), commandAvailable('ffprobe')]);
    return send(res, ffmpeg && ffprobe ? 200 : 503, {
      ok:ffmpeg && ffprobe,
      ffmpeg,
      ffprobe,
      gemini:Boolean(process.env.GEMINI_API_KEY),
      callback:Boolean(CALLBACK_TOKEN),
      youtube:{ church:Boolean(CHANNELS.church.refreshToken), mission:Boolean(CHANNELS.mission.refreshToken) }
    });
  }
  if (req.method === 'POST' && ['/render','/publish','/'].includes(url.pathname)) {
    try { return await acceptBatch(await bodyJson(req), res); }
    catch (error) { return send(res, 400, { error:String(error?.message || error) }); }
  }
  return send(res, 404, { error:'not found' });
});

await fsp.mkdir(WORK_ROOT, { recursive:true });
server.listen(PORT, '0.0.0.0', () => {
  console.log(`EKODI devotional executor listening on :${PORT}`);
});