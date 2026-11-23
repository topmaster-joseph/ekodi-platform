import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { enforceClientTrafficBudget, withEdgeTrafficShield, EDGE_TRAFFIC_SHIELD_POLICY } from '../edge-traffic-shield.js';

function limiter(limit) {
  const counts = new Map();
  const keys = [];
  return {
    keys,
    async limit({ key }) { keys.push(key); const n = (counts.get(key) || 0) + 1; counts.set(key, n); return { success: n <= limit }; },
  };
}
const req = (path, { method = 'GET', ip = '203.0.113.7', ua = 'Mozilla/5.0 test', headers = {} } = {}) =>
  new Request('https://ekodi.kr' + path, { method, headers: { ...(ip ? { 'cf-connecting-ip': ip } : {}), 'user-agent': ua, ...headers } });

test('a flooding client is throttled alone; another client is unaffected', async () => {
  const env = { TRAFFIC_CLIENT_RATE_LIMITER: limiter(3), TRAFFIC_NETWORK_RATE_LIMITER: limiter(100) };
  for (let i = 0; i < 3; i++) assert.equal(await enforceClientTrafficBudget(req('/ekodichurch/'), env), null);
  const blocked = await enforceClientTrafficBudget(req('/ekodichurch/', { headers: { accept: 'text/html' } }), env);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '10');
  assert.equal(blocked.headers.get('x-ekodi-traffic-shield'), 'client');
  assert.equal(blocked.headers.get('cache-control'), 'no-store');
  assert.match(await blocked.text(), /잠시/);
  assert.equal(await enforceClientTrafficBudget(req('/ekodichurch/', { ip: '198.51.100.9' }), env), null);
});

test('IP ceiling defeats user-agent and cookie rotation', async () => {
  const env = { TRAFFIC_CLIENT_RATE_LIMITER: limiter(1000), TRAFFIC_NETWORK_RATE_LIMITER: limiter(2) };
  assert.equal(await enforceClientTrafficBudget(req('/', { ua: 'a' }), env), null);
  assert.equal(await enforceClientTrafficBudget(req('/', { ua: 'b', headers: { cookie: 'sid=aaaaaaaaaaaaaaaaaaaa' } }), env), null);
  const blocked = await enforceClientTrafficBudget(req('/api/x', { ua: 'c' }), env);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('x-ekodi-traffic-shield'), 'network');
  assert.equal(JSON.parse(await blocked.text()).error, 'TRAFFIC_CLIENT_THROTTLED');
});

test('signed-in sessions get their own budget even behind one shared NAT IP', async () => {
  const client = limiter(1);
  const env = { TRAFFIC_CLIENT_RATE_LIMITER: client, TRAFFIC_NETWORK_RATE_LIMITER: limiter(100) };
  assert.equal(await enforceClientTrafficBudget(req('/admin/', { headers: { cookie: 'ekodi_session=user-one-xxxxxxxx' } }), env), null);
  assert.equal(await enforceClientTrafficBudget(req('/admin/', { headers: { cookie: 'ekodi_session=user-two-xxxxxxxx' } }), env), null);
  assert.ok(client.keys.every(key => key.startsWith('read:cookie:')));
  assert.ok(client.keys.every(key => !key.includes('user-one')), 'raw cookie never used as a key');
});

test('fails open, skips probes, mutations and service-binding calls', async () => {
  assert.equal(await enforceClientTrafficBudget(req('/'), {}), null, 'no bindings → never blocks reads');
  const broken = { TRAFFIC_CLIENT_RATE_LIMITER: { limit: async () => { throw new Error('down'); } }, TRAFFIC_NETWORK_RATE_LIMITER: { limit: async () => { throw new Error('down'); } } };
  assert.equal(await enforceClientTrafficBudget(req('/'), broken), null, 'limiter failure → never blocks reads');
  const zero = { TRAFFIC_CLIENT_RATE_LIMITER: limiter(0), TRAFFIC_NETWORK_RATE_LIMITER: limiter(0) };
  assert.equal(await enforceClientTrafficBudget(req('/health'), zero), null);
  assert.equal(await enforceClientTrafficBudget(req('/robots.txt'), zero), null);
  assert.equal(await enforceClientTrafficBudget(req('/api/order', { method: 'POST' }), zero), null, 'writes are governed by the write limiter');
  assert.equal(await enforceClientTrafficBudget(req('/', { ip: '' }), zero), null, 'internal service-binding requests are not bucketed');
});

test('satellite wrapper: blocks floods and bad methods, passes payment callbacks without limiter bindings', async () => {
  let calls = 0;
  const worker = withEdgeTrafficShield({ async fetch() { calls++; return new Response('ok', { headers: { 'content-type': 'text/plain' } }); }, scheduled() {} }, { service: 'qtin-order' });
  assert.equal(typeof worker.scheduled, 'function', 'other handlers preserved');
  const ok = await worker.fetch(req('/qtin/'), { ENVIRONMENT: 'production' });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('x-ekodi-traffic-policy'), EDGE_TRAFFIC_SHIELD_POLICY);
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
  assert.match(ok.headers.get('strict-transport-security'), /max-age=31536000/);
  const callback = await worker.fetch(req('/qtin/api/payments/confirm', { method: 'POST' }), { ENVIRONMENT: 'production' });
  assert.equal(callback.status, 200, 'missing write limiters must not 503 a payment callback');
  const trace = await worker.fetch({ method: 'TRACE', url: 'https://ekodi.kr/qtin/', headers: new Headers({ 'cf-connecting-ip': '203.0.113.7' }) }, {});
  assert.equal(trace.status, 405);
  const env = { ENVIRONMENT: 'production', TRAFFIC_CLIENT_RATE_LIMITER: limiter(1), TRAFFIC_NETWORK_RATE_LIMITER: limiter(100) };
  await worker.fetch(req('/qtin/'), env);
  const flood = await worker.fetch(req('/qtin/'), env);
  assert.equal(flood.status, 429);
  assert.equal(calls, 3, 'blocked requests never reach the worker');
});

test('satellite wrapper enforces the shared write limiter when bound', async () => {
  const worker = withEdgeTrafficShield({ async fetch() { return new Response('ok'); } }, { service: 'support' });
  const env = { ENVIRONMENT: 'production', PLATFORM_PUBLIC_WRITE_RATE_LIMITER: limiter(1), PLATFORM_SENSITIVE_RATE_LIMITER: limiter(1) };
  assert.equal((await worker.fetch(req('/support/ticket', { method: 'POST' }), env)).status, 200);
  assert.equal((await worker.fetch(req('/support/ticket', { method: 'POST' }), env)).status, 429);
  assert.equal((await worker.fetch(req('/support/api/x', { method: 'POST' }), env)).status, 200);
  assert.equal((await worker.fetch(req('/support/api/x', { method: 'POST' }), env)).status, 429);
});

test('every apex-path satellite and the Shared Site carry the shield and its bindings', () => {
  const satellites = {
    'church-history-worker.js': 'wrangler.church-history.toml', 'delivery-worker.js': 'wrangler.delivery.toml',
    'ekodibiz-pay-gateway-worker.js': 'wrangler.ekodibiz-pay-gateway.toml', 'ekodipay-worker.js': 'wrangler.ekodipay.toml',
    'local-commerce-worker.js': 'wrangler.local-commerce.toml', 'ministry-news-worker.js': 'wrangler.ministry-news.toml',
    'qtin-order-entry.js': 'wrangler.qtin-order.toml', 'support-worker.js': 'wrangler.support.toml',
    'seonammedi-domain-gateway.js': 'wrangler.seonammedi-redirect.toml', 'services/independent-board/worker.js': 'wrangler.independent-board.toml',
  };
  for (const [file, toml] of Object.entries(satellites)) {
    assert.match(readFileSync(file, 'utf8'), /export default withEdgeTrafficShield\(/, file);
    const config = readFileSync(toml, 'utf8');
    for (const name of ['PLATFORM_PUBLIC_WRITE_RATE_LIMITER', 'PLATFORM_SENSITIVE_RATE_LIMITER', 'TRAFFIC_CLIENT_RATE_LIMITER', 'TRAFFIC_NETWORK_RATE_LIMITER'])
      assert.ok(config.includes(`name = "${name}"`), `${toml} binds ${name}`);
  }
  const site = readFileSync('wrangler.site.toml', 'utf8');
  assert.ok(site.includes('name = "TRAFFIC_CLIENT_RATE_LIMITER"') && site.includes('name = "TRAFFIC_NETWORK_RATE_LIMITER"'));
  const router = readFileSync('platform-router-entry-worker.js', 'utf8');
  const start = router.indexOf('async fetch(request,env,ctx){');
  assert.ok(router.indexOf('enforceClientTrafficBudget(', start) < router.indexOf('assessTrafficTier(', start), 'client isolation runs before site-wide tier');
});

test('device agent idle polling backs off and stays fast while work exists', () => {
  const agent = readFileSync('tools/ekodi-device-agent/windows/ekodi-device-agent.ps1', 'utf8');
  const run = agent.slice(agent.indexOf('function Run-Agent'));
  assert.match(run, /if \(\$script:LastPollHadCommand\) \{ \$pollSeconds = 2 \}/);
  assert.match(run, /\[Math\]::Min\(20, \[Math\]::Max\(10, \$pollSeconds \+ 5\)\)/);
  assert.match(run, /Start-Sleep -Seconds \$pollSeconds/);
  assert.doesNotMatch(run.slice(0, run.indexOf('} finally')), /Start-Sleep -Seconds 10\b/);
  assert.match(agent, /if \(-not \$response\.command\) \{ return \}\r?\n  \$script:LastPollHadCommand = \$true/);
});

test('a leftover interactive-auth file stops counting once it has expired', () => {
  const agent = readFileSync('tools/ekodi-device-agent/windows/ekodi-device-agent.ps1', 'utf8');
  const live = agent.slice(agent.indexOf('function Test-EkodiInteractiveAuthLive'), agent.indexOf('function Save-EkodiInteractiveAuthState'));
  assert.match(live, /\$state\.expiresAt/);
  assert.match(live, /-gt \(Get-Date\)\.ToUniversalTime\(\)/);
  const run = agent.slice(agent.indexOf('function Run-Agent'));
  assert.match(run, /elseif \(Test-EkodiInteractiveAuthLive\) \{ \$pollSeconds = 5 \}/);
  const update = agent.slice(agent.indexOf('function Invoke-EkodiAgentAutoUpdateIfApproved'), agent.indexOf('function Invoke-EkodiAgentAutoUpdateIfApproved') + 400);
  assert.match(update, /\(Test-EkodiInteractiveAuthLive\)\) \{ return \}/, 'an expired file no longer blocks auto-update');
});
