import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import aiWorker from '../ai-control-worker.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('common services have one operator surface in central Admin', () => {
  const policy = JSON.parse(read('config/service-workspace-policy.json'));
  const rule = policy.commonServiceOperatorAccessRule;
  assert.equal(rule.surface, 'admin.ekodi.kr');
  assert.equal(rule.runtimeHostsAreOperatorPages, false);
  assert.equal(rule.directRuntimeRootBehavior, 'redirect_to_admin_control_plane');
  assert.equal(rule.sessionAuthority, 'central_admin_session');
  assert.equal(rule.authorityContext, 'Person + Workspace + Role + Capability');
  assert.equal(rule.internalOperationalInfoBeforeAuthentication, false);
  assert.equal(rule.perServiceLoginUi, false);
});

test('Admin menu mounts the common-service operator module', () => {
  const registry = read('admin-menu-registry.js');
  const loader = read('admin-demand-loader.js');
  const layout = read('admin-menu-layout.js');
  const common = read('common-services-admin.js');
  const handoff = read('admin-central-handoff.js');
  const site = read('site-worker.js');
  assert.match(registry, /id: 'common-services'.*group: 'common'/);
  assert.doesNotMatch(loader, /common-services-admin\.(?:css|js)/);
  assert.match(layout, /import\('\.\/common-services-admin\.js'\)/);
  assert.match(common, /common-services-admin\.css/);
  assert.match(layout, /#common-services:common-services/);
  assert.match(handoff, /campus common-services ai-ops/);
  assert.match(site, /ADMIN_COMMON_SERVICE_AI_PREFIX/);
  assert.match(site, /proxyAdminCommonServiceAi/);
});

test('common-service Admin UI consumes the central admin session and has no service login UI', () => {
  const source = read('common-services-admin.js');
  assert.match(source, /TOKEN_KEY='ekodi-auth-token'/);
  assert.match(source, /\/api\/control\/common-services\/\$\{path\}/);
  assert.match(source, /Person \+ Workspace \+ Role \+ Capability/);
  assert.match(source, /AI Control Runtime/);
  assert.doesNotMatch(source, /Google 로그인|ekodi-ai-control-session|site=ai/);
});

test('AI runtime root is an operator handoff, not a standalone admin page', async () => {
  const response = await aiWorker.fetch(new Request('https://ai.ekodi.kr/'), {}, { waitUntil() {} });
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'https://admin.ekodi.kr/?route=common-services&service=ai');
  assert.equal(response.headers.get('x-ekodi-route'), 'ai-runtime-admin-handoff');
});

test('AI runtime service-local login and public config are retired', async () => {
  const config = await aiWorker.fetch(new Request('https://ai.ekodi.kr/config.js'), {}, { waitUntil() {} });
  assert.equal(config.status, 410);
  assert.equal((await config.json()).error, 'operator_surface_moved');
  const exchange = await aiWorker.fetch(new Request('https://ai.ekodi.kr/api/auth/exchange'), {}, { waitUntil() {} });
  assert.equal(exchange.status, 410);
  assert.equal((await exchange.json()).error, 'service_local_auth_retired');
});

test('AI runtime exposes only minimal unauthenticated health and protects detailed status', async () => {
  const health = await aiWorker.fetch(new Request('https://ai.ekodi.kr/__health'), {}, { waitUntil() {} });
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok:true, platform:'ai-control', architectureVersion:'1.8.1', surface:'runtime-only' });
  const status = await aiWorker.fetch(new Request('https://ai.ekodi.kr/api/status'), {}, { waitUntil() {} });
  assert.equal(status.status, 401);
  assert.equal((await status.json()).error, 'authentication_required');
});

test('AI runtime accepts central Admin authority with ai:read without a service-local session', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    assert.match(String(input), /https:\/\/api\.ekodi\.kr\/api\/session/);
    return new Response(JSON.stringify({
      authenticated:true,
      email:'operator@example.com',
      role:'operator',
      authority:{kind:'admin',role:'operator',capabilities:['ai:read','service:read'],deniedCapabilities:[]},
    }), {status:200,headers:{'content-type':'application/json'}});
  };
  try {
    const response = await aiWorker.fetch(new Request('https://ai.ekodi.kr/api/session', {headers:{authorization:'Bearer central-admin-token'}}), {}, { waitUntil() {} });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.authoritySource, 'central-admin');
    assert.equal(data.user.email, 'operator@example.com');
    assert.equal(data.user.role, 'operator');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('read-only central Admin authority cannot perform AI operator mutations', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    authenticated:true,
    email:'viewer@example.com',
    role:'viewer',
    authority:{kind:'admin',role:'viewer',capabilities:['ai:read'],deniedCapabilities:[]},
  }), {status:200,headers:{'content-type':'application/json'}});
  try {
    const response = await aiWorker.fetch(new Request('https://ai.ekodi.kr/api/nodes/pair', {method:'POST',headers:{authorization:'Bearer central-admin-token','content-type':'application/json'},body:'{}'}), {}, { waitUntil() {} });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error:'capability_required', capability:'ai:operate' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('production build ships the common-service operator assets through the secured Admin route', () => {
  const build = read('scripts/build.mjs');
  const site = read('site-worker.js');
  assert.match(build, /common-services-admin\.css/);
  assert.match(build, /common-services-admin\.js/);
  assert.match(site, /'\/common-services-admin\.css'/);
  assert.match(site, /'\/common-services-admin\.js'/);
});
