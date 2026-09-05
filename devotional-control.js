import authWorker from './auth-worker.js';
import { EKODI_SEPTEMBER_2026, buildEkodiSeptemberBatch } from './integrations/devotion-studio/ekodi-september-2026.js';

const PREFIX = '/api/control/devotional';
const BATCH_KEY = '2026-09';

function json(data, status = 200, sourceHeaders = new Headers()) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  for (const name of ['access-control-allow-origin', 'access-control-allow-headers', 'access-control-allow-methods', 'access-control-max-age', 'vary']) {
    const value = sourceHeaders.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function sessionCheck(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env);
  if (!response.ok) return { response };
  return { response, session: await response.clone().json() };
}

function studioConfig(env) {
  return {
    endpoint: String(env.DEVOTION_STUDIO_ENDPOINT || '').replace(/\/$/, ''),
    key: String(env.DEVOTION_STUDIO_KEY || ''),
    workspaceId: String(env.DEVOTION_STUDIO_WORKSPACE_ID || ''),
    churchTargetRef: String(env.DEVOTION_STUDIO_CHURCH_TARGET_REF || ''),
    missionTargetRef: String(env.DEVOTION_STUDIO_MISSION_TARGET_REF || '')
  };
}

function configured(config) {
  return Boolean(config.endpoint && config.key && config.workspaceId);
}

function integrationBatch(config, passages = EKODI_SEPTEMBER_2026) {
  const base = buildEkodiSeptemberBatch({
    workspaceId: config.workspaceId || 'not-connected',
    churchTargetRef: config.churchTargetRef,
    missionTargetRef: config.missionTargetRef
  });
  return {
    ...base,
    items: passages.map((passage, index) => ({
      id: String(index + 1).padStart(2, '0'),
      passage: String(passage),
      metadata: { devotion_date: `2026-09-${String(index + 1).padStart(2, '0')}` }
    }))
  };
}

function disconnectedState(config) {
  const batch = integrationBatch(config);
  return {
    month: BATCH_KEY,
    serviceConnected: false,
    connected: false,
    renderReady: false,
    channels: batch.publication_targets.map(target => ({
      id: target.id,
      name: target.metadata.label,
      time: target.metadata.default_publish_time,
      connected: false
    })),
    items: batch.items.map((item, index) => ({
      day: index + 1,
      passage: item.passage,
      status: 'draft',
      church: 'not_connected',
      mission: 'not_connected'
    }))
  };
}

async function studioFetch(config, path, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('authorization', `Bearer ${config.key}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${config.endpoint}${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Devotion Studio HTTP ${response.status}`);
    error.status = response.status;
    error.code = body.code || 'DEVOTION_STUDIO_UPSTREAM_ERROR';
    throw error;
  }
  return body;
}

function publicationStatus(snapshot, targetId, connected) {
  if (!connected) return 'not_connected';
  const publication = [...(snapshot.publications || [])].reverse().find(item => item.target_id === targetId);
  return publication?.status || (['ready', 'scheduled', 'published'].includes(snapshot.render_status) ? 'ready' : 'draft');
}

function toAdminState(snapshot) {
  const capabilities = snapshot.capabilities || {};
  const targetCapabilities = capabilities.publication_targets || {};
  const targets = snapshot.publication_targets || [];
  const channels = targets.map(target => ({
    id: target.id,
    name: target.metadata?.label || target.id,
    time: target.metadata?.default_publish_time || '',
    connected: Boolean(targetCapabilities[target.id] ?? target.config_ref)
  }));
  const connectedById = Object.fromEntries(channels.map(channel => [channel.id, channel.connected]));
  return {
    month: snapshot.batch_key || BATCH_KEY,
    serviceConnected: true,
    connected: channels.length > 0 && channels.every(channel => channel.connected),
    renderReady: Boolean(capabilities.renderer),
    channels,
    items: (snapshot.items || []).map((item, index) => ({
      day: Number(String(item.metadata?.devotion_date || '').slice(-2)) || index + 1,
      passage: item.passage,
      status: snapshot.render_status || 'draft',
      church: publicationStatus(snapshot, 'church', connectedById.church),
      mission: publicationStatus(snapshot, 'mission', connectedById.mission)
    }))
  };
}

async function getSnapshot(config) {
  const snapshot = await studioFetch(config, `/v1/batches/${encodeURIComponent(BATCH_KEY)}?workspace_id=${encodeURIComponent(config.workspaceId)}`);
  return toAdminState(snapshot);
}

async function seed(request, config) {
  const body = await request.json().catch(() => ({}));
  const passages = Array.isArray(body.passages) && body.passages.length === 30 ? body.passages : EKODI_SEPTEMBER_2026;
  const batch = integrationBatch(config, passages);
  const snapshot = await studioFetch(config, `/v1/batches/${encodeURIComponent(BATCH_KEY)}`, {
    method: 'PUT',
    body: JSON.stringify(batch)
  });
  return toAdminState(snapshot);
}

async function generate(config) {
  return studioFetch(config, `/v1/batches/${encodeURIComponent(BATCH_KEY)}/render`, {
    method: 'POST',
    body: JSON.stringify({
      workspace_id: config.workspaceId,
      format: { width: 1080, height: 1920, fps: 30, codec: 'h264' }
    })
  });
}

export async function handleDevotionalControl(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  const auth = await sessionCheck(request, env);
  if (!auth.session) return auth.response;
  const config = studioConfig(env);

  if (request.method === 'GET' && url.pathname === PREFIX) {
    if (!configured(config)) return json(disconnectedState(config), 200, auth.response.headers);
    try {
      return json(await getSnapshot(config), 200, auth.response.headers);
    } catch (error) {
      if (error.status === 404) return json(disconnectedState(config), 200, auth.response.headers);
      return json({ ...disconnectedState(config), error: error.message, code: error.code }, 200, auth.response.headers);
    }
  }

  if (!configured(config)) {
    return json({ error: '독립 Devotion Studio 서비스가 아직 연결되지 않았습니다.', code: 'DEVOTION_STUDIO_NOT_CONNECTED' }, 409, auth.response.headers);
  }

  try {
    if (request.method === 'POST' && url.pathname === `${PREFIX}/seed`) return json(await seed(request, config), 200, auth.response.headers);
    if (request.method === 'POST' && url.pathname === `${PREFIX}/generate`) return json(await generate(config), 202, auth.response.headers);
  } catch (error) {
    return json({ error: error.message, code: error.code || 'DEVOTION_STUDIO_UPSTREAM_ERROR' }, error.status || 502, auth.response.headers);
  }

  return json({ error: '지원하지 않는 매일묵상 작업입니다.', code: 'DEVOTIONAL_ROUTE_NOT_FOUND' }, 404, auth.response.headers);
}

export const DEVOTIONAL_SEPTEMBER_2026 = EKODI_SEPTEMBER_2026;
