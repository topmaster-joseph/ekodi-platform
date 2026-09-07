import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('ai.ekodi.kr has one runtime owner and no Shared Site ownership', () => {
  const constitution = read('CONSTITUTION.md');
  const production = read('wrangler.ai.release.toml');
  const shared = read('wrangler.site.toml');
  const worker = read('ai-control-worker.js');
  const router = read('platform-router-entry-worker.js');

  assert.match(constitution, /`ai\.ekodi\.kr` is the registered provider-independent AI Gateway\/Core boundary/);
  assert.match(production, /pattern = "ai\.ekodi\.kr"/);
  assert.doesNotMatch(shared, /pattern = "ai\.ekodi\.kr"/);
  assert.match(worker, /function adminControlRedirect\(\)/);
  assert.match(worker, /surface:'runtime-only'/);
  assert.match(worker, /operator_surface_moved/);
  assert.match(worker, /service_local_auth_retired/);
  assert.doesNotMatch(router, /AI_GATEWAY_HOST|ai-gateway-page\.js/);
  assert.equal(fs.existsSync(new URL('../ai-gateway-page.js', import.meta.url)), false);
});

test('production verifier follows the AI Control runtime-only contract', () => {
  const workflow = read('.github/workflows/verify-ai-gateway-production.yml');
  const manifest = JSON.parse(read('deploy/manifests/ai-control.worker.json'));

  assert.match(workflow, /Deploy EKODI AI Control Plane/);
  assert.match(workflow, /root_code.*ai\.ekodi\.kr\//s);
  assert.match(workflow, /health_code.*\/__health/s);
  assert.match(workflow, /config_code.*\/config\.js/s);
  assert.match(workflow, /exchange_code.*\/api\/auth\/exchange/s);
  assert.match(workflow, /status_code.*\/api\/status/s);
  assert.match(workflow, /\[ "\$root_code" = '307' \]/);
  assert.doesNotMatch(workflow, /ai-gateway\.js|AI COMMAND CONSOLE|memoryToken/);

  const requests = manifest.worker.requests;
  assert.equal(requests.find(item => item.url === 'https://ai.ekodi.kr/')?.statuses?.[0], 307);
  assert.equal(requests.find(item => item.url.endsWith('/__health'))?.statuses?.[0], 200);
  assert.equal(requests.find(item => item.url.endsWith('/config.js'))?.statuses?.[0], 410);
  assert.equal(requests.find(item => item.url.endsWith('/api/status'))?.statuses?.[0], 401);
  assert.equal(requests.find(item => item.url.endsWith('/api/auth/exchange'))?.statuses?.[0], 410);
});
