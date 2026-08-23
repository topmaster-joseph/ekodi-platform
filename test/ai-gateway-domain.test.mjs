import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AI_GATEWAY_HOST, aiGatewayPage, aiGatewayScript } from '../ai-gateway-page.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('root AI Gateway is an admin-only provider status surface', async () => {
  assert.equal(AI_GATEWAY_HOST, 'ai.ekodi.kr');
  const response = aiGatewayPage();
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-ekodi-route'), 'ai-gateway');
  assert.match(response.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.match(html, /EKODI AI Gateway/);
  assert.match(html, /Google 관리자 인증/);
  assert.match(html, /실제 연결 테스트/);
  assert.match(html, /\*\.ai\.ekodi\.kr/);
  assert.doesNotMatch(html, /OPENAI_API_KEY|sk-proj-/);
});

test('AI Gateway client uses protected same-origin provider status and explicit assist test', async () => {
  const response = aiGatewayScript();
  const script = await response.text();
  assert.equal(response.headers.get('x-ekodi-route'), 'ai-gateway-asset');
  assert.match(script, /\/api\/control\/ai\/provider-status/);
  assert.match(script, /\/api\/control\/ai\/assist/);
  assert.match(script, /ekodi_admin_token/);
  assert.match(script, /OpenAI 실제 호출/);
});

test('Worker, auth and release contracts include the AI Gateway hostname', () => {
  const router = read('platform-router-entry-worker.js');
  const wrangler = read('wrangler.site.toml');
  const auth = read('auth-site/admin-auth.js');
  const manifest = JSON.parse(read('deploy/manifests/shared-site.worker.json'));

  assert.match(router, /host===AI_GATEWAY_HOST/);
  assert.match(wrangler, /pattern = "ai\.ekodi\.kr"[\s\S]*custom_domain = true/);
  assert.match(auth, /u\.origin==='https:\/\/ai\.ekodi\.kr'/);

  const urls = new Set(manifest.worker.requests.map(item => item.url));
  assert.equal(urls.has('https://ai.ekodi.kr/'), true);
  assert.equal(urls.has('https://ai.ekodi.kr/ai-gateway.js'), true);
});
