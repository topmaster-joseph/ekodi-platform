import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('AI Commons has one canonical public path and a private runtime owner', () => {
  const production = read('wrangler.ai.release.toml');
  const shared = read('wrangler.site.toml');
  const worker = read('ai-control-worker.js');
  const site = read('site-worker.js');
  const routes = read('platform-route-registry.js');

  assert.doesNotMatch(production, /pattern = "ai\.ekodi\.kr"/);
  assert.match(production, /User traffic enters through ekodi\.kr\/ai via the shared-site service binding/);
  assert.match(shared, /binding = "AI"[\s\S]*service = "ekodi-ai-control"/);
  assert.match(shared, /"\/ai"/);
  assert.match(shared, /"\/ai\/\*"/);
  assert.doesNotMatch(shared, /"\/ai\*"/);
  assert.match(site, /url\.pathname === '\/ai'/);
  assert.match(site, /url\.pathname\.startsWith\('\/ai\/'\)/);
  assert.match(site, /env\.AI\.fetch/);
  assert.match(routes, /'ai','bible'/);
  assert.match(worker, /surface:'runtime-and-commons'/);
  assert.match(worker, /commons:true/);
  assert.doesNotMatch(read('platform-router-entry-worker.js'), /AI_GATEWAY_HOST|ai-gateway-page\.js/);
});
test('production verifier follows the AI Commons public/member boundary contract', () => {
  const workflow = read('.github/workflows/verify-ai-gateway-production.yml');
  const manifest = JSON.parse(read('deploy/manifests/ai-control.worker.json'));
  const html = read('ai-control/commons.html');

  assert.match(workflow, /https:\/\/ekodi\.kr\/ai\//);
  assert.match(workflow, /api\/commons\/services/);
  assert.match(workflow, /api\/commons\/requests/);
  assert.match(workflow, /api\/commons\/ideas/);
  assert.match(workflow, /EKODI 모두의 AI 프로젝트/);
  assert.doesNotMatch(workflow, /https:\/\/ai\.ekodi\.kr/);

  const requests = manifest.worker.requests;
  assert.equal(requests.find(item => item.url === 'https://ekodi.kr/ai/')?.statuses?.[0], 200);
  assert.equal(requests.find(item => item.url.endsWith('/__health'))?.statuses?.[0], 200);
  assert.equal(requests.find(item => item.url.endsWith('/api/commons/services'))?.statuses?.[0], 200);
  assert.equal(requests.find(item => item.url.endsWith('/api/commons/requests'))?.statuses?.[0], 200);
  assert.equal(requests.find(item => item.url.endsWith('/api/commons/ideas'))?.statuses?.[0], 401);
  const rootProbe = requests.find(item => item.url === 'https://ekodi.kr/ai/');
  assert.ok(rootProbe.headerExpect.includes('x-ekodi-canonical-surface: ai'));
  assert.ok(rootProbe.headerExpect.includes('x-ekodi-canonical-path: /ai'));
  assert.equal(rootProbe.candidateUrl, 'https://ekodi-ai-control.topmaster-joseph.workers.dev/');
  assert.equal(requests.find(item => item.url.endsWith('/__health'))?.candidateUrl, 'https://ekodi-ai-control.topmaster-joseph.workers.dev/__health');
  const clientVersion = html.match(/src="\.\/api\/commons\/client\?v=([^"]+)"/)?.[1];
  const styleVersion = html.match(/href="\.\/api\/commons\/style\?v=([^"]+)"/)?.[1];
  assert.ok(clientVersion && styleVersion);
  assert.equal(clientVersion, styleVersion);
  assert.equal(requests.find(item => item.url.startsWith('https://ekodi.kr/ai/api/commons/client?v='))?.url, `https://ekodi.kr/ai/api/commons/client?v=${clientVersion}`);
  assert.equal(requests.find(item => item.url.startsWith('https://ekodi.kr/ai/api/commons/style?v='))?.url, `https://ekodi.kr/ai/api/commons/style?v=${styleVersion}`);
});
