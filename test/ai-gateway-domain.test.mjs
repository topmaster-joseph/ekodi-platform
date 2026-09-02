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
  assert.match(html, /AI COMMAND CONSOLE/);
  assert.match(html, /대화 · 운영 명령/);
  assert.match(html, /activeProvider/);
  assert.match(html, /chatForm/);
  assert.match(html, /sessionIdentity/);
  assert.match(html, /loginMessage/);
  assert.match(html, /\*\.ai\.ekodi\.kr/);
  assert.doesNotMatch(html, /OPENAI_API_KEY|sk-proj-/);
});

test('AI Gateway client preserves Google admin handoff until session validation', async () => {
  const response = aiGatewayScript();
  const script = await response.text();
  assert.equal(response.headers.get('x-ekodi-route'), 'ai-gateway-asset');
  assert.match(script, /const HANDOFF_KEY='ekodi_admin_token'/);
  assert.match(script, /let memoryToken=''/);
  assert.match(script, /TOKEN_PATTERN=\/\^\[a-f0-9\]\{64\}\$\/i/);
  assert.match(script, /function acceptHandoff\(\)/);
  assert.match(script, /function clearHandoff\(\)/);
  assert.match(script, /Google 관리자 인증 완료 · 세션 확인 중/);
  assert.match(script, /const session=await request\('\/api\/session'\)/);
  assert.match(script, /signedIn\(true\);clearHandoff\(\)/);
  assert.match(script, /Google 인증은 완료됐지만 EKODI 세션 확인에 실패했습니다/);
  assert.match(script, /세션 확인 지연/);
  assert.match(script, /\/api\/control\/ai\/provider-status/);
  assert.match(script, /\/api\/control\/ai\/assist/);
  assert.match(script, /queueOperationalRequest/);
  assert.ok(script.includes('/api/control/ai/actions'));
  assert.match(script, /providerName/);
  assert.match(script, /sendChat/);

  const acceptBody = script.match(/function acceptHandoff\(\)\{([\s\S]*?)\}\nfunction clearHandoff/)?.[1] || '';
  assert.doesNotMatch(acceptBody, /history\.replaceState/);
  assert.match(acceptBody, /setToken\(value\)/);
});

test('Worker, auth and release contracts include the AI Gateway hostname', () => {
  const router = read('platform-router-entry-worker.js');
  const wrangler = read('wrangler.site.toml');
  const apiWrangler = read('wrangler.api.toml');
  const auth = read('auth-site/admin-auth.js');
  const manifest = JSON.parse(read('deploy/manifests/shared-site.worker.json'));

  assert.match(router, /host===AI_GATEWAY_HOST/);
  assert.match(wrangler, /pattern = "ai\.ekodi\.kr"[\s\S]*custom_domain = true/);
  assert.doesNotMatch(wrangler, /\[ai\][\s\S]*binding = "AI"/);
  assert.match(apiWrangler, /\[ai\][\s\S]*binding = "AI"/);
  assert.match(auth, /u\.origin==='https:\/\/ai\.ekodi\.kr'/);
  assert.match(auth, /ekodi_admin_token:result\.token/);

  const urls = new Set(manifest.worker.requests.map(item => item.url));
  assert.equal(urls.has('https://ai.ekodi.kr/'), true);
  assert.equal(urls.has('https://ai.ekodi.kr/ai-gateway.js'), true);
});
