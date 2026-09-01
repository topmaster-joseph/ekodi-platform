import http from 'node:http';
import { createAssetService } from './service.js';
import { createFilesystemStore } from './adapters/filesystem-store.js';
import { createHttpStorageGateway } from './adapters/http-storage-gateway.js';

const port = Number(process.env.PORT || 8789);
const serviceKey = String(process.env.ASSET_SERVICE_KEY || '');
const gatewayEndpoint = String(process.env.STORAGE_GATEWAY_ENDPOINT || '');
const store = gatewayEndpoint
  ? createHttpStorageGateway({ endpoint: gatewayEndpoint, token: process.env.STORAGE_GATEWAY_TOKEN })
  : createFilesystemStore({ baseDir: process.env.ASSET_STORE_DIR || './data/devotion-assets' });
const service = createAssetService({ store });

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

async function readBody(req, maxBytes = 64 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw Object.assign(new Error('request too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, service.ready() ? 200 : 503, { ok: service.ready(), service: 'ekodi.devotion-assets', connected: service.ready() });
  if (serviceKey && req.headers.authorization !== `Bearer ${serviceKey}`) return sendJson(res, 401, { error: 'unauthorized', code: 'UNAUTHORIZED' });

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'v1' || parts[1] !== 'assets' || !parts[2]) return sendJson(res, 404, { error: 'not found', code: 'NOT_FOUND' });
  const assetKey = decodeURIComponent(parts.slice(2).join('/'));
  const workspaceId = String(url.searchParams.get('workspace_id') || '');

  try {
    if (req.method === 'PUT') {
      const data = await readBody(req);
      const metadata = JSON.parse(req.headers['x-asset-metadata'] || '{}');
      const result = await service.put({ workspace_id: workspaceId, asset_key: assetKey, data, mime_type: req.headers['content-type'], metadata });
      return sendJson(res, 200, result);
    }
    if (req.method === 'GET') {
      const result = await service.get({ workspace_id: workspaceId, asset_key: assetKey });
      if (!result) return sendJson(res, 404, { error: 'asset not found', code: 'ASSET_NOT_FOUND' });
      res.writeHead(200, {
        'content-type': result.mime_type || 'application/octet-stream',
        'x-asset-metadata': JSON.stringify(result.metadata || {}),
        'x-asset-stored-at': result.stored_at || '',
        'cache-control': 'no-store'
      });
      return res.end(result.data);
    }
    return sendJson(res, 404, { error: 'not found', code: 'NOT_FOUND' });
  } catch (error) {
    const code = String(error?.code || 'ASSET_SERVICE_ERROR');
    const status = code.endsWith('_NOT_CONNECTED') ? 409 : /required/i.test(String(error?.message)) ? 400 : 500;
    return sendJson(res, status, { error: String(error?.message || 'asset operation failed'), code });
  }
}).listen(port, '0.0.0.0', () => console.log(`Devotion Assets listening on :${port}`));
