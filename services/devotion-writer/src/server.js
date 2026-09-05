import http from 'node:http';
import { createDevotionWriter } from './service.js';
import { createGeminiWriterProvider } from './providers/gemini.js';
import { createCodexCliWriterProvider } from './providers/codex-cli.js';

const port = Number(process.env.PORT || 8791);
const serviceKey = String(process.env.WRITER_SERVICE_KEY || '');
const providers = [
  createGeminiWriterProvider({
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.DEVOTION_WRITER_GEMINI_MODEL || 'gemini-3.7-flash'
  }),
  createCodexCliWriterProvider({
    enabled: process.env.DEVOTION_WRITER_ALLOW_CODEX === 'true',
    model: process.env.DEVOTION_WRITER_CODEX_MODEL || ''
  })
];
const service = createDevotionWriter({ providers });
const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

async function readJson(req, maxBytes = 256 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw Object.assign(new Error('request too large'), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    const connected = service.ready();
    return send(res, connected.length ? 200 : 503, { ok: connected.length > 0, service: 'ekodi.devotion-writer', providers: connected });
  }
  if (serviceKey && req.headers.authorization !== `Bearer ${serviceKey}`) return send(res, 401, { error: 'unauthorized', code: 'UNAUTHORIZED' });
  if (req.method !== 'POST' || url.pathname !== '/v1/write') return send(res, 404, { error: 'not found', code: 'NOT_FOUND' });
  try {
    return send(res, 200, await service.write(await readJson(req)));
  } catch (error) {
    const code = String(error?.code || 'WRITER_ERROR');
    const status = code.endsWith('_NOT_CONNECTED') ? 409 : /required/i.test(String(error?.message)) ? 400 : Number(error?.status || 500);
    return send(res, status, { error: String(error?.message || 'writer failed'), code });
  }
}).listen(port, '0.0.0.0', () => console.log(`Devotion Writer listening on :${port}`));
