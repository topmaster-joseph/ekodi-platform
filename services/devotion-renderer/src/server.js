import http from 'node:http';
import { renderBatch, ffmpegAvailable } from './render.js';

const port = Number(process.env.PORT || 8787);
const serviceKey = String(process.env.RENDER_SERVICE_KEY || '');
const outputDir = String(process.env.OUTPUT_DIR || '/tmp/ekodi-devotion-renderer');
const ffmpegPath = String(process.env.FFMPEG_PATH || 'ffmpeg');
const fontName = String(process.env.CAPTION_FONT_NAME || 'Noto Sans CJK KR');

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

async function readJson(req, maxBytes = 8 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw Object.assign(new Error('request too large'), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    const ready = await ffmpegAvailable(ffmpegPath);
    return send(res, ready ? 200 : 503, { ok: ready, service: 'ekodi.devotion-renderer.ffmpeg', ffmpeg: ready });
  }
  if (serviceKey && req.headers.authorization !== `Bearer ${serviceKey}`) return send(res, 401, { error: 'unauthorized', code: 'UNAUTHORIZED' });
  if (req.method !== 'POST' || url.pathname !== '/v1/render') return send(res, 404, { error: 'not found', code: 'NOT_FOUND' });

  try {
    const payload = await readJson(req);
    const result = await renderBatch({
      job: payload.job,
      batch: payload.batch,
      outputDir,
      ffmpegPath,
      fontName
    });
    return send(res, 200, { ok: true, ...result });
  } catch (error) {
    return send(res, Number(error?.status || 500), { error: String(error?.message || 'render failed'), code: 'RENDER_FAILED' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Devotion Renderer listening on :${port}`);
});
