import authWorker from './auth-worker.js';
import { handleKakaoPersonalControl } from './kakao-personal-control.js';

const PROVIDERS = new Set(['youtube','instagram','facebook','kakao','blog','threads','live','tiktok','linkedin','other']);
const POLICIES = new Set(['inherit_org','custom','none']);
const DEFAULT_REGISTRY = {
  version: 3,
  organizations: [
    {
      id: 'community', name: '커뮤니티', shortName: 'Community',
      description: '공동체, 선교, 지역과 디아스포라의 이야기를 연결합니다.',
      website: 'https://community.ekodi.kr', isActive: true, order: 10, socialPolicy: 'inherit_org',
      channels: [
        { id:'community-youtube', provider:'youtube', label:'YouTube', handle:'@ekodicommunity', channelId:'UCm1PFvzN0PRnyiF8Xx_mYTw', uploadsPlaylist:'UUm1PFvzN0PRnyiF8Xx_mYTw', url:'https://www.youtube.com/@ekodicommunity', description:'말씀 · 공동체 · 선교 · 현장', isActive:true, order:10 },
        { id:'community-instagram', provider:'instagram', label:'Instagram', url:'https://www.instagram.com/ekodicommunity', description:'사진 · 현장 · 짧은 이야기', isActive:true, order:20 },
        { id:'community-live', provider:'live', label:'EKODI Live', url:'https://live.ekodi.kr', description:'라이브 방송 허브', isActive:true, order:30 }
      ]
    },
    {
      id:'church', name:'에코디교회', shortName:'Church',
      description:'예배, 말씀, 목양과 로컬교회의 소식을 전합니다.',
      website:'https://ekodi.kr/ekodichurch', isActive:true, order:20, socialPolicy:'inherit_org',
      channels:[
        { id:'church-youtube', provider:'youtube', label:'YouTube', handle:'@ekodichurch', channelId:'UCnp_LXmJBcJRX7CgJT9FF7w', uploadsPlaylist:'UUnp_LXmJBcJRX7CgJT9FF7w', url:'https://www.youtube.com/@ekodichurch', description:'예배 · 말씀 · Shorts', isActive:true, order:10 },
        { id:'church-live', provider:'live', label:'EKODI Live', url:'https://live.ekodi.kr', description:'예배 및 현장 라이브', isActive:true, order:20 }
      ]
    },
    { id:'biz', name:'에코디비즈', shortName:'Biz', description:'비즈니스, 소상공인, 마케팅 AI와 지역경제 콘텐츠를 모읍니다.', website:'https://ekodi.kr/ekodibiz', isActive:true, order:30, socialPolicy:'inherit_org', channels:[] },
    { id:'books', name:'출판', shortName:'Books', description:'출판, 전자책, 연구와 저자 콘텐츠를 연결합니다.', website:'https://books.ekodi.kr', isActive:true, order:40, socialPolicy:'inherit_org', channels:[] }
  ]
};

function httpsUrl(value, field) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${field} is required`);
  let url;
  try { url = new URL(text); } catch { throw new Error(`${field} must be a valid URL`); }
  if (url.protocol !== 'https:') throw new Error(`${field} must use https`);
  return url.toString();
}
function text(value, max = 120) { return String(value || '').trim().slice(0, max); }
function safeId(value, field) {
  const id = text(value, 64).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`${field} must use lowercase letters, numbers or hyphens`);
  return id;
}
function order(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(9999, Math.trunc(n))) : fallback;
}

export function normalizeRegistry(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.organizations)) throw new Error('organizations must be an array');
  if (input.organizations.length < 1 || input.organizations.length > 40) throw new Error('organizations count must be between 1 and 40');
  const orgIds = new Set();
  const organizations = input.organizations.map((rawOrg, orgIndex) => {
    const id = safeId(rawOrg.id, 'organization.id');
    if (orgIds.has(id)) throw new Error(`duplicate organization id: ${id}`);
    orgIds.add(id);
    const name = text(rawOrg.name, 80);
    if (!name) throw new Error(`organization ${id} needs a name`);
    if (/에코디선교회|EKODI선교회/.test(name)) throw new Error('legacy EKODI mission organization name is not allowed');
    const policy = POLICIES.has(rawOrg.socialPolicy) ? rawOrg.socialPolicy : 'inherit_org';
    const rawChannels = Array.isArray(rawOrg.channels) ? rawOrg.channels : [];
    if (rawChannels.length > 30) throw new Error(`organization ${id} has too many channels`);
    const channelIds = new Set();
    const channels = rawChannels.map((raw, index) => {
      const provider = text(raw.provider, 24).toLowerCase();
      if (!PROVIDERS.has(provider)) throw new Error(`unsupported provider: ${provider}`);
      const channelId = safeId(raw.id || `${id}-${provider}-${index + 1}`, 'channel.id');
      if (channelIds.has(channelId)) throw new Error(`duplicate channel id: ${channelId}`);
      channelIds.add(channelId);
      const label = text(raw.label, 60) || provider;
      const item = {
        id: channelId, provider, label, url: httpsUrl(raw.url, `channel ${channelId}.url`),
        description: text(raw.description, 180), isActive: raw.isActive !== false, order: order(raw.order, (index + 1) * 10)
      };
      for (const key of ['handle','channelId','uploadsPlaylist']) {
        const value = text(raw[key], 120);
        if (value) item[key] = value;
      }
      return item;
    }).sort((a,b) => a.order - b.order || a.label.localeCompare(b.label));
    return {
      id, name, shortName: text(rawOrg.shortName, 60) || name, description: text(rawOrg.description, 240),
      website: httpsUrl(rawOrg.website, `organization ${id}.website`),
      isActive: rawOrg.isActive !== false, order: order(rawOrg.order, (orgIndex + 1) * 10), socialPolicy: policy, channels
    };
  }).sort((a,b) => a.order - b.order || a.name.localeCompare(b.name));
  return { version: 3, organizations };
}

async function ensureSchema(db) {
  if (!db) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS social_registry_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      registry_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS social_registry_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      revision INTEGER NOT NULL,
      registry_json TEXT NOT NULL,
      changed_at TEXT NOT NULL,
      changed_by TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_social_registry_history_revision ON social_registry_history(revision DESC)')
  ]);
  const seeded = normalizeRegistry(DEFAULT_REGISTRY);
  await db.prepare(`INSERT OR IGNORE INTO social_registry_config (id, registry_json, revision, updated_at, updated_by)
    VALUES (1, ?, 1, ?, 'system-seed')`).bind(JSON.stringify(seeded), new Date().toISOString()).run();
}

async function readRegistry(env) {
  if (!env.DB) return { registry: normalizeRegistry(DEFAULT_REGISTRY), revision: 0, updatedAt: null, updatedBy: 'bundled-default' };
  await ensureSchema(env.DB);
  const row = await env.DB.prepare('SELECT registry_json, revision, updated_at, updated_by FROM social_registry_config WHERE id = 1').first();
  return {
    registry: normalizeRegistry(JSON.parse(row.registry_json)), revision: Number(row.revision || 1),
    updatedAt: row.updated_at || null, updatedBy: row.updated_by || ''
  };
}

function corsHeaders(request, env, isPublic = false) {
  const headers = new Headers();
  const origin = request.headers.get('origin') || '';
  if (isPublic) headers.set('access-control-allow-origin', '*');
  else {
    const allowed = new Set(String(env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean));
    if (origin && allowed.has(origin)) headers.set('access-control-allow-origin', origin);
    if (origin) headers.set('vary', 'Origin');
  }
  headers.set('access-control-allow-headers', 'authorization, content-type');
  headers.set('access-control-allow-methods', 'GET, PUT, OPTIONS');
  headers.set('x-content-type-options', 'nosniff');
  return headers;
}
function json(data, status, request, env, isPublic = false) {
  const headers = corsHeaders(request, env, isPublic);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', isPublic && status === 200 ? 'public, max-age=120, stale-while-revalidate=300' : 'no-store');
  return new Response(JSON.stringify(data), { status, headers });
}
async function adminSession(request, env) {
  const url = new URL(request.url); url.pathname = '/api/session'; url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method:'GET', headers:request.headers }), env);
  if (!response.ok) return { response };
  return { response, session: await response.clone().json() };
}
async function audit(env, session, action, detail) {
  if (!env.DB) return;
  try {
    const admin = await env.DB.prepare('SELECT id FROM admins WHERE email = ?').bind(session.email).first();
    await env.DB.prepare(`INSERT INTO audit_logs (admin_id, action, resource, detail, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(admin?.id || null, action, 'social-registry', text(detail, 500), new Date().toISOString()).run();
  } catch (error) { console.warn('social registry audit skipped', error?.message || error); }
}

export async function handleSocialRegistry(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path.startsWith('/api/control/social/kakao/')) return handleKakaoPersonalControl(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:corsHeaders(request, env, path.startsWith('/api/social/')) });
  if (path === '/api/social/registry' && request.method === 'GET') {
    try {
      const current = await readRegistry(env);
      const registry = { ...current.registry, organizations: current.registry.organizations.filter(org => org.isActive).map(org => ({ ...org, channels: org.channels.filter(ch => ch.isActive) })) };
      return json({ ...registry, revision: current.revision, updatedAt: current.updatedAt }, 200, request, env, true);
    } catch (error) {
      console.error('public social registry', error);
      return json({ error:'social_registry_unavailable' }, 503, request, env, true);
    }
  }
  if (!path.startsWith('/api/control/social/')) return null;
  const auth = await adminSession(request, env);
  if (!auth.session) return auth.response;
  if (!env.DB) return json({ error:'Social registry database is not configured.' }, 503, request, env);
  await ensureSchema(env.DB);

  if (path === '/api/control/social/registry' && request.method === 'GET') {
    const current = await readRegistry(env);
    return json(current, 200, request, env);
  }
  if (path === '/api/control/social/history' && request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT revision, changed_at, changed_by FROM social_registry_history ORDER BY id DESC LIMIT 40').all();
    return json({ history: rows.results.map(row => ({ revision:row.revision, changedAt:row.changed_at, changedBy:row.changed_by })) }, 200, request, env);
  }
  if (path === '/api/control/social/registry' && request.method === 'PUT') {
    let body;
    try { body = await request.json(); } catch { return json({ error:'Invalid JSON payload.' }, 400, request, env); }
    let registry;
    try { registry = normalizeRegistry(body?.registry || body); } catch (error) { return json({ error:error.message }, 400, request, env); }
    const current = await readRegistry(env);
    const expected = Number(body?.expectedRevision ?? current.revision);
    if (Number.isFinite(expected) && expected !== current.revision) return json({ error:'Social registry changed in another session. Refresh and try again.', code:'REVISION_CONFLICT', revision:current.revision }, 409, request, env);
    const nextRevision = current.revision + 1;
    const now = new Date().toISOString();
    const by = text(auth.session.email || 'admin', 160);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO social_registry_history (revision, registry_json, changed_at, changed_by) VALUES (?, ?, ?, ?)').bind(current.revision, JSON.stringify(current.registry), now, by),
      env.DB.prepare('UPDATE social_registry_config SET registry_json = ?, revision = ?, updated_at = ?, updated_by = ? WHERE id = 1').bind(JSON.stringify(registry), nextRevision, now, by)
    ]);
    await audit(env, auth.session, 'social.registry.update', JSON.stringify({ revision:nextRevision, organizations:registry.organizations.length }));
    return json({ registry, revision:nextRevision, updatedAt:now, updatedBy:by }, 200, request, env);
  }
  return json({ error:'Social control endpoint not found.' }, 404, request, env);
}

export { DEFAULT_REGISTRY };