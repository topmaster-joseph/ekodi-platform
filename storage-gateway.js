import { canonicalDriveStatus, writeCanonicalDriveFile } from './canonical-drive-writer.js';

const STORAGE_PREFIX = '/api/storage/v1';
const STORAGE_CONTROL_ORIGIN = 'https://drive.ekodi.kr';
const MAX_INLINE_BYTES = 8 * 1024 * 1024;
const RETENTION_CLASSES = new Set(['temporary', 'operational', 'business_record', 'permanent']);
const encoder = new TextEncoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function constantTimeEqual(a, b) {
  const aa = encoder.encode(String(a || ''));
  const bb = encoder.encode(String(b || ''));
  if (aa.length !== bb.length || aa.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function authorized(request, env) {
  const expected = String(env.EKODI_STORAGE_GATEWAY_KEY || '').trim();
  const supplied = String(request.headers.get('x-ekodi-storage-key') || '').trim();
  return expected && constantTimeEqual(expected, supplied);
}

function localCanonicalRuntime(env) {
  return Boolean(env.DB && env.STORAGE_CREDENTIAL_KEY && env.GOOGLE_DRIVE_CLIENT_SECRET);
}

async function proxyToStorageControl(request, env) {
  const source = new URL(request.url);
  const target = new URL(source.pathname + source.search, STORAGE_CONTROL_ORIGIN);
  const headers = new Headers(request.headers);
  headers.delete('host');
  const init = { method: request.method, headers, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.clone().arrayBuffer();
  const response = await fetch(target, init);
  return new Response(response.body, { status: response.status, headers: response.headers });
}

function validateRecord(body) {
  if (!body || typeof body !== 'object') throw new Error('STORAGE_INVALID_BODY');
  for (const key of ['spaceId', 'serviceId', 'recordType', 'createdBy', 'retentionClass']) {
    if (!String(body[key] || '').trim()) throw new Error(`STORAGE_MISSING_${key.toUpperCase()}`);
  }
  if (!RETENTION_CLASSES.has(String(body.retentionClass))) throw new Error('STORAGE_INVALID_RETENTION');
}

function decodeBody(body) {
  if (typeof body.contentText === 'string') {
    const bytes = encoder.encode(body.contentText);
    if (bytes.byteLength > MAX_INLINE_BYTES) throw new Error('STORAGE_PAYLOAD_TOO_LARGE');
    return bytes;
  }
  if (typeof body.contentBase64 === 'string') {
    const binary = atob(body.contentBase64);
    if (binary.length > MAX_INLINE_BYTES) throw new Error('STORAGE_PAYLOAD_TOO_LARGE');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  throw new Error('STORAGE_CONTENT_REQUIRED');
}

async function audit(env, record, requestId, result, status) {
  if (!env.DB) return;
  await env.DB.prepare(`INSERT INTO storage_audit_logs
    (request_id, space_id, service_id, storage_route, record_type, retention_class, source_module_id, drive_file_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      String(requestId || crypto.randomUUID()),
      String(record.spaceId || ''),
      String(record.serviceId || ''),
      String(record.storageRoute || ''),
      String(record.recordType || ''),
      String(record.retentionClass || ''),
      String(record.sourceModuleId || ''),
      String(result?.id || ''),
      status,
      new Date().toISOString(),
    ).run();
}

function errorStatus(message) {
  if (message.includes('PAYLOAD_TOO_LARGE')) return 413;
  if (message.includes('ROUTE_REQUIRED') || message.includes('MISSING') || message.includes('REQUIRED') || message.includes('INVALID')) return 400;
  if (message.includes('NOT_READY') || message.includes('DB_MISSING') || message.includes('CREDENTIAL_KEY_MISSING')) return 503;
  if (message.includes('DRIVE_MISMATCH')) return 409;
  return 502;
}

async function storeViaControlPlane(env, record, requestId) {
  const key = String(env.EKODI_STORAGE_GATEWAY_KEY || '').trim();
  if (!key) throw new Error('STORAGE_GATEWAY_KEY_MISSING');
  const response = await fetch(`${STORAGE_CONTROL_ORIGIN}${STORAGE_PREFIX}/records`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ekodi-storage-key': key,
      'x-request-id': requestId,
    },
    body: JSON.stringify(record),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.code || `STORAGE_CONTROL_HTTP_${response.status}`);
  return payload;
}

export async function storeEkodiDurableRecord(env, record = {}, options = {}) {
  validateRecord(record);
  const requestId = String(options.requestId || crypto.randomUUID());
  if (!localCanonicalRuntime(env)) return storeViaControlPlane(env, record, requestId);

  const bytes = decodeBody(record);
  let result = null;
  try {
    result = await writeCanonicalDriveFile(env, {
      storageRoute: record.storageRoute,
      serviceId: record.serviceId,
      title: record.title || `${record.recordType}-${new Date().toISOString()}.json`,
      mimeType: record.mimeType || 'application/octet-stream',
      bytes,
      spaceId: record.spaceId,
      recordType: record.recordType,
      createdBy: record.createdBy,
      retentionClass: record.retentionClass,
      sourceModuleId: record.sourceModuleId || 'ekodi',
    });
    await audit(env, { ...record, storageRoute: result.storageRoute }, requestId, result, 'stored');
    return {
      ok: true,
      requestId,
      systemOfRecord: 'google_workspace_shared_drive',
      driveName: result.canonicalDriveName || 'EKODI',
      file: result,
    };
  } catch (error) {
    await audit(env, record, requestId, result, 'failed').catch(() => {});
    throw error;
  }
}

export async function handleStorageGateway(request, env = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(STORAGE_PREFIX)) return null;

  if (!localCanonicalRuntime(env)) return proxyToStorageControl(request, env);

  if (request.method === 'GET' && url.pathname === `${STORAGE_PREFIX}/health`) {
    const status = await canonicalDriveStatus(env);
    return json({
      ok: true,
      version: '1.0.0',
      service: 'ekodi-storage-control',
      canonicalStore: 'google_workspace_shared_drive',
      driveName: 'EKODI',
      canonicalDriveReady: status.ready,
      routeSummary: status.routes || [],
      directExternalDriveAccess: false,
    });
  }

  if (!authorized(request, env)) return json({ error: 'Storage Gateway 인증이 필요합니다.', code: 'STORAGE_UNAUTHORIZED' }, 401);

  if (request.method === 'GET' && url.pathname === `${STORAGE_PREFIX}/policy`) {
    return json({
      version: '1.0.0',
      canonicalStore: 'google_workspace_shared_drive',
      canonicalControlPlane: 'drive.ekodi.kr',
      credentialsSource: 'encrypted_storage_connections',
      routeSource: 'storage_routes',
      operationalStore: 'd1_or_supabase',
      deliveryStore: 'cloudflare_r2',
      directExternalDriveAccess: false,
    });
  }

  if (request.method === 'POST' && url.pathname === `${STORAGE_PREFIX}/records`) {
    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'JSON 요청이 필요합니다.', code: 'STORAGE_INVALID_JSON' }, 400); }
    try {
      const result = await storeEkodiDurableRecord(env, body, { requestId: request.headers.get('x-request-id') || undefined });
      return json(result, 201);
    } catch (error) {
      console.error('Storage Gateway error', error);
      const message = String(error?.message || 'STORAGE_ERROR');
      return json({ error: '공유드라이브 저장 처리에 실패했습니다.', code: message.split(':')[0] }, errorStatus(message));
    }
  }

  return json({ error: 'Storage Gateway endpoint not found', code: 'STORAGE_NOT_FOUND' }, 404);
}

export const STORAGE_GATEWAY_CONTRACT = Object.freeze({
  version: '1.0.0',
  prefix: STORAGE_PREFIX,
  canonicalStore: 'google_workspace_shared_drive',
  canonicalControlPlane: 'drive.ekodi.kr',
  credentialsSource: 'encrypted_storage_connections',
  routeSource: 'storage_routes',
  driveName: 'EKODI',
  maxInlineBytes: MAX_INLINE_BYTES,
  directExternalDriveAccess: false,
});
