import { COOPERATIVES, cooperativeBySlug, cooperativeInitialState, cooperativePublicProjection } from './cooperative-registry.js';
import { cooperativeIdentity, cooperativeGrantForEmail, cooperativeGrantDecision, resolveCooperativeAccess } from './cooperative-core-access.js';
import { loadCooperativeProject, saveCooperativeProject, normalizeCooperativeState, cooperativeMemberProjection } from './cooperative-store.js';
import { cooperativePage, cooperativeOperationsPage } from './cooperative-page.js';
import { cooperativeCss, cooperativeScript } from './cooperative-ui.js';
import { cooperativeCharter } from './cooperative-charter.js';

const headers = (type = 'application/json; charset=utf-8') => ({
  'content-type': type, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin', 'x-frame-options': 'SAMEORIGIN',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://renzehysxirjilvdxacv.supabase.co; base-uri 'none'; frame-ancestors 'self'; form-action 'self'",
});
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: headers() });
const trim = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

export function cooperativeRoute(pathname) {
  const path = String(pathname || '').replace(/\/+$/, '');
  const platform = path.match(/^\/admin\/workspaces\/cooperatives\/([a-z0-9-]+)$/);
  const control = path.match(/^\/api\/control\/cooperatives\/([a-z0-9-]+)(\/.*)?$/);
  const local = path.match(/^\/([a-z0-9-]+)(\/.*)?$/);
  const slug = platform?.[1] || control?.[1] || local?.[1];
  const coop = cooperativeBySlug(slug);
  if (!coop) return null;
  return { coop, path: platform ? '/admin' : control ? '/api' + (control[2] || '') : local[2] || '/', platformContext: Boolean(platform || control) };
}

async function inputJson(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw Object.assign(new Error('JSON_REQUIRED'), { status: 415 });
  const origin = request.headers.get('origin');
  if (origin !== 'https://ekodi.kr' || request.headers.get('sec-fetch-site') === 'cross-site') throw Object.assign(new Error('SAME_ORIGIN_REQUIRED'), { status: 403 });
  const raw = await request.text();
  if (raw.length > 262144) throw Object.assign(new Error('COOP_REQUEST_TOO_LARGE'), { status: 413 });
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw Object.assign(new Error('COOP_INVALID_JSON'), { status: 400 }); }
}

async function application(request, env, coop) {
  const identity = await cooperativeIdentity(request, env);
  if (!identity) return json({ ok: false, code: 'COOP_LOGIN_REQUIRED' }, 401);
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT representative, business, message, status, updated_at FROM cooperative_applications WHERE workspace_id = ? AND person_id = ?')
      .bind(coop.workspaceId, identity.id).first();
    return json({ ok: true, application: row || null });
  }
  if (request.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  const body = await inputJson(request);
  if (body.workspaceId || body.slug || body.role || body.status || body.email) return json({ ok: false, code: 'COOP_IMMUTABLE_IDENTITY' }, 400);
  const representative = trim(body.representative, 80);
  if (!representative || body.consent !== true) return json({ ok: false, code: 'COOP_APPLICATION_CONSENT_REQUIRED' }, 400);
  const timestamp = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO cooperative_applications (workspace_id, person_id, email, representative, business, message, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    ON CONFLICT(workspace_id, person_id) DO UPDATE SET representative = excluded.representative, business = excluded.business, message = excluded.message, updated_at = excluded.updated_at`)
    .bind(coop.workspaceId, identity.id, identity.email, representative, trim(body.business, 160) || null, trim(body.message, 1000), timestamp, timestamp).run();
  return json({ ok: true, status: 'pending', grantsCreated: false }, 202);
}

export async function routeCooperative(request, env) {
  const url = new URL(request.url);
  if (url.hostname !== 'ekodi.kr') return null;
  const hubPath = url.pathname.replace(/\/+$/, '');
  if (['/business-coop/assets/app.css', '/business-coop/assets/app.js'].includes(hubPath) && ['GET', 'HEAD'].includes(request.method)) {
    const css = hubPath.endsWith('.css');
    return new Response(request.method === 'HEAD' ? null : css ? cooperativeCss() : cooperativeScript(), { headers: headers(css ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8') });
  }
  if (['/business-coop', '/business-coop/admin', '/admin/workspaces/cooperatives'].includes(hubPath) && ['GET', 'HEAD'].includes(request.method)) {
    const h = new Headers(headers('text/html; charset=utf-8')); h.set('x-robots-tag', 'noindex, nofollow, noarchive'); h.set('x-ekodi-route', 'cooperative-operations');
    return new Response(request.method === 'HEAD' ? null : cooperativeOperationsPage(hubPath.startsWith('/admin/')), { headers: h });
  }
  if (['/api/cooperatives/overview', '/api/control/cooperatives/overview'].includes(hubPath)) {
    if (request.method !== 'GET') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
    if (!env.DB?.prepare) return json({ ok: false, code: 'COOP_DATABASE_UNAVAILABLE' }, 503);
    try {
    const identity = await cooperativeIdentity(request, env);
    if (!identity) return json({ ok: false, code: 'COOP_LOGIN_REQUIRED' }, 401);
    const platformContext = hubPath.startsWith('/api/control/');
    const cooperatives = [];
      for (const coop of COOPERATIVES) {
        const access = await resolveCooperativeAccess(request, env, coop, { administrative: true, platformContext });
        if (!access.allowed) continue;
        const project = await loadCooperativeProject(env.DB, coop);
        cooperatives.push({ workspaceId: coop.workspaceId, slug: coop.slug, name: project.state.profile.name,
          chair: project.state.profile.chair, status: 'formation', revision: project.revision, updatedAt: project.updatedAt,
          representatives: project.state.founders.length, businessesRegistered: project.state.founders.filter(f => f.business).length,
          documentsReviewed: Object.values(project.state.documents).filter(d => d.status === 'reviewed').length,
          documentsTotal: Object.keys(project.state.documents).length,
          adminPath: platformContext ? '/admin/workspaces/cooperatives/' + coop.slug : '/' + coop.slug + '/admin' });
      }
      if (!cooperatives.length) return json({ ok: false, code: platformContext ? 'PLATFORM_ADMIN_REQUIRED' : 'COOP_ADMIN_REQUIRED' }, 403);
      return json({ ok: true, authority: { scope: platformContext ? 'platform' : 'tenant' }, cooperatives });
    } catch { return json({ ok: false, code: 'COOP_SERVICE_UNAVAILABLE' }, 503); }
  }
  // Keep the retained browser drafts and their original modules out of generic
  // tenant/SPACE routing when the operations namespace is Worker-first.
  if (hubPath === '/business-coop' || hubPath.startsWith('/business-coop/')) {
    if (!['GET', 'HEAD'].includes(request.method)) return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
    const retained = new Set(['/business-coop/drafts', '/business-coop/drafts/index.html', '/business-coop/app.css', '/business-coop/legal-data.js', '/business-coop/admin/admin.js']);
    if (!retained.has(hubPath)) return json({ ok: false, code: 'COOP_ROUTE_NOT_FOUND' }, 404);
    if (!env.ASSETS?.fetch) return json({ ok: false, code: 'COOP_ASSETS_UNAVAILABLE' }, 503);
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    response.headers.set('cache-control', 'no-store');
    response.headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
    response.headers.set('x-content-type-options', 'nosniff');
    response.headers.set('x-ekodi-route', 'cooperative-retained-drafts');
    return response;
  }
  const route = cooperativeRoute(url.pathname);
  if (!route) return null;
  const { coop, path, platformContext } = route;
  try {
    if (!platformContext && url.pathname === '/' + coop.slug) {
      const target = new URL(request.url); target.pathname += '/';
      return new Response(null, { status: 308, headers: { ...headers(), location: target.href, 'x-ekodi-route': 'cooperative-canonical-root' } });
    }
    if (['GET', 'HEAD'].includes(request.method)) {
      if (path === '/assets/app.css' && !platformContext) return new Response(request.method === 'HEAD' ? null : cooperativeCss(), { headers: headers('text/css; charset=utf-8') });
      if (path === '/assets/app.js' && !platformContext) return new Response(request.method === 'HEAD' ? null : cooperativeScript(), { headers: headers('text/javascript; charset=utf-8') });
      if (['/', '/members', '/admin'].includes(path)) {
        const surface = path === '/' ? 'public' : path.slice(1);
        const h = new Headers(headers('text/html; charset=utf-8'));
        h.set('x-ekodi-route', `cooperative-${surface}`);
        h.set('x-ekodi-workspace-id', coop.workspaceId);
        if (surface !== 'public') h.set('x-robots-tag', 'noindex, nofollow, noarchive');
        return new Response(request.method === 'HEAD' ? null : cooperativePage(coop, surface, platformContext), { headers: h });
      }
    }
    if (!path.startsWith('/api/')) return json({ ok: false, code: 'COOP_ROUTE_NOT_FOUND' }, 404);
    if (path === '/api/public' && ['GET', 'HEAD'].includes(request.method) && !platformContext) {
      let state = cooperativeInitialState(coop);
      let source = 'formation-template';
      if (env.DB?.prepare) {
        try { state = (await loadCooperativeProject(env.DB, coop)).state; source = 'server'; } catch {}
      }
      return json({ ok: true, source, ...cooperativePublicProjection(coop, state) });
    }
    if (!env.DB?.prepare) return json({ ok: false, code: 'COOP_DATABASE_UNAVAILABLE' }, 503);
    if (path === '/api/application' && !platformContext) return application(request, env, coop);
    const administrative = path === '/api/project' || path === '/api/export';
    const access = await resolveCooperativeAccess(request, env, coop, { administrative, platformContext });
    if (!access.allowed) return json({ ok: false, code: access.code }, access.status);
    const project = await loadCooperativeProject(env.DB, coop);
    if (path === '/api/me' && request.method === 'GET') return json({ ok: true, ...cooperativeMemberProjection(coop, project, access) });
    if (path === '/api/project' && request.method === 'GET') {
      const applications = await env.DB.prepare('SELECT person_id, email, representative, business, message, status, updated_at FROM cooperative_applications WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 100').bind(coop.workspaceId).all();
      return json({ ok: true, workspaceId: coop.workspaceId, ...project, authority: { scope: access.scope, role: access.role }, applications: applications.results || [] });
    }
    if (path === '/api/project' && request.method === 'PUT') {
      const body = await inputJson(request);
      if (Object.keys(body).some(key => !['revision', 'state'].includes(key))) return json({ ok: false, code: 'COOP_IMMUTABLE_IDENTITY' }, 400);
      const state = normalizeCooperativeState(body.state, coop, project.state);
      const existingAccounts = new Map(project.state.founders.map(f => [f.id, f.accountEmail]));
      for (const f of state.founders) if (f.accountEmail && f.accountEmail !== existingAccounts.get(f.id)) {
        const grant = await cooperativeGrantForEmail(env, coop, f.accountEmail);
        if (!cooperativeGrantDecision(grant).allowed) return json({ ok: false, code: 'COOP_ACCOUNT_GRANT_REQUIRED' }, 400);
      }
      return json({ ok: true, workspaceId: coop.workspaceId, ...(await saveCooperativeProject(env.DB, coop, state, body.revision, access)) });
    }
    if (path === '/api/charter' && request.method === 'GET') {
      const h = new Headers(headers('text/plain; charset=utf-8'));
      h.set('content-disposition', `attachment; filename="${coop.slug}-charter-draft.txt"`);
      return new Response(cooperativeCharter(coop, project.state), { headers: h });
    }
    if (path === '/api/export' && request.method === 'GET') {
      const h = new Headers(headers());
      h.set('content-disposition', `attachment; filename="${coop.slug}-formation.json"`);
      return new Response(JSON.stringify({ workspaceId: coop.workspaceId, slug: coop.slug, ...project }, null, 2), { headers: h });
    }
    if (path === '/api/my-business' && request.method === 'PUT' && !platformContext) {
      const body = await inputJson(request);
      if (Object.keys(body).some(key => !['business', 'industry', 'revision'].includes(key))) return json({ ok: false, code: 'COOP_SELF_FIELDS_ONLY' }, 400);
      const founder = project.state.founders.find(f => f.accountEmail === access.identity.email);
      if (!founder) return json({ ok: false, code: 'COOP_ACCOUNT_NOT_LINKED' }, 403);
      founder.business = trim(body.business, 160) || null;
      founder.industry = trim(body.industry, 160) || null;
      const result = await saveCooperativeProject(env.DB, coop, project.state, body.revision, access);
      return json({ ok: true, ...cooperativeMemberProjection(coop, result, access) });
    }
    return json({ ok: false, code: 'COOP_ROUTE_NOT_FOUND' }, 404);
  } catch (error) {
    const status = Number(error.status) || 503;
    if (status >= 500) console.error('Cooperative request unavailable', coop.slug, error.code || error.message);
    return json({ ok: false, code: error.code || (status < 500 ? error.message : 'COOP_SERVICE_UNAVAILABLE') }, status);
  }
}
