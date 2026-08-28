// EKODI Domain & Site Architecture v2 operator-approved verification marker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProfessionalAiPath, professionalAiPage, PROFESSIONAL_AI_IDS } from '../professional-ai-entry-page.js';

test('professional AI index and first wave use root AI paths', () => {
  assert.deepEqual([...PROFESSIONAL_AI_IDS], ['marketing','creator','life','energy','support']);
  assert.equal(resolveProfessionalAiPath('/ai/').kind, 'index');
  for (const id of PROFESSIONAL_AI_IDS) {
    const route=resolveProfessionalAiPath(`/ai/${id}/`);
    assert.equal(route.aiId,id);
    assert.equal(route.canonicalPath,`/ai/${id}/`);
  }
});

test('legacy author path normalizes to creator canonical without changing runtime ownership', () => {
  const route=resolveProfessionalAiPath('/ai/author');
  assert.equal(route.aiId,'creator');
  assert.equal(route.redirect,true);
  assert.equal(route.canonicalPath,'/ai/creator/');
  assert.equal(route.ai.runtime,'https://author.ekodi.kr/');
});

test('Marketing AI spaces use nested root paths and normalize compatibility slugs', () => {
  const jadam=resolveProfessionalAiPath('/ai/marketing/jadam/');
  assert.equal(jadam.kind,'space');
  assert.equal(jadam.canonicalPath,'/ai/marketing/jadam/');
  assert.equal(jadam.space.runtime,'https://marketing.ekodi.kr/jadam/');
  const yogurt=resolveProfessionalAiPath('/ai/marketing/yogurtpurple');
  assert.equal(yogurt.canonicalPath,'/ai/marketing/yogurt/');
  assert.equal(yogurt.redirect,true);
});

test('unknown AI and non-Marketing nested routes do not invent services', () => {
  assert.equal(resolveProfessionalAiPath('/ai/unknown/'),null);
  assert.equal(resolveProfessionalAiPath('/ai/energy/jadam/'),null);
  assert.equal(resolveProfessionalAiPath('/not-ai/marketing/'),null);
});

test('canonical entry pages expose root canonical while runtime remains compatibility execution', async () => {
  const route=resolveProfessionalAiPath('/ai/energy/');
  const response=professionalAiPage(route);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-route'),'professional-ai');
  const html=await response.text();
  assert.match(html,/https:\/\/ekodi\.kr\/ai\/energy\//);
  assert.match(html,/https:\/\/energy\.ekodi\.kr\//);
  assert.match(html,/기존 서브도메인은 현재 기능 안정성을 위해 호환 실행 주소/);
});
