// EKODI Domain & Site Architecture v2 operator-approved verification marker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProfessionalAiPath, professionalAiPage, PROFESSIONAL_AI_IDS } from '../professional-ai-entry-page.js';

const MARKETING_SPACES=['church','biz','jadam','pizzamaru','yogurt','cgma'];

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

test('all current Marketing AI spaces use nested root paths and keep compatibility runtime separate', () => {
  for(const spaceId of MARKETING_SPACES){
    const route=resolveProfessionalAiPath(`/ai/marketing/${spaceId}/`);
    assert.ok(route,`missing Marketing AI route: ${spaceId}`);
    assert.equal(route.kind,'space');
    assert.equal(route.aiId,'marketing');
    assert.equal(route.spaceId,spaceId);
    assert.equal(route.canonicalPath,`/ai/marketing/${spaceId}/`);
    assert.match(route.space.runtime,/^https:\/\/marketing\.ekodi\.kr\//);
    assert.notEqual(route.space.runtime,`https://ekodi.kr${route.canonicalPath}`);
  }
  const yogurt=resolveProfessionalAiPath('/ai/marketing/yogurtpurple');
  assert.equal(yogurt.canonicalPath,'/ai/marketing/yogurt/');
  assert.equal(yogurt.redirect,true);
});

test('unknown AI and unsupported nested routes do not invent services or subdomains', () => {
  assert.equal(resolveProfessionalAiPath('/ai/unknown/'),null);
  assert.equal(resolveProfessionalAiPath('/ai/energy/jadam/'),null);
  assert.equal(resolveProfessionalAiPath('/not-ai/marketing/'),null);
  assert.equal(resolveProfessionalAiPath('/ai/marketing/new-tenant/'),null);
});

test('canonical entry pages expose root canonical while runtime remains compatibility execution', async () => {
  for(const id of PROFESSIONAL_AI_IDS){
    const route=resolveProfessionalAiPath(`/ai/${id}/`);
    const response=professionalAiPage(route);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('x-ekodi-route'),'professional-ai');
    const html=await response.text();
    assert.match(html,new RegExp(`https:\\/\\/ekodi\\.kr\\/ai\\/${id}\\/`));
    assert.match(html,/호환 실행 주소|전문AI/);
  }
});

test('Marketing AI space entry pages keep My EKODI and runtime handoff explicit', async()=>{
  for(const spaceId of MARKETING_SPACES){
    const route=resolveProfessionalAiPath(`/ai/marketing/${spaceId}/`);
    const response=professionalAiPage(route);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('x-ekodi-route'),'professional-ai-space');
    const html=await response.text();
    assert.match(html,new RegExp(`https:\\/\\/ekodi\\.kr\\/ai\\/marketing\\/${spaceId}\\/`));
    assert.match(html,new RegExp(`https:\\/\\/my\\.ekodi\\.kr\\/${spaceId}\\/`));
    assert.match(html,/https:\/\/marketing\.ekodi\.kr\//);
  }
});
