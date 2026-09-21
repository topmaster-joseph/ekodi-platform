import test from 'node:test';
import assert from 'node:assert/strict';
import router from '../platform-router-entry-worker.js';
import { churchMemberHomePage, isChurchMemberHomePath } from '../church-member-home-page.js';

test('church member home has its own private user surface', async () => {
  assert.equal(isChurchMemberHomePath('/ekodichurch/my'), true);
  assert.equal(isChurchMemberHomePath('/ekodichurch/admin'), false);
  const response=churchMemberHomePage(new Request('https://ekodi.kr/ekodichurch/my'));
  const html=await response.text();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-route'),'church-member-home');
  assert.equal(response.headers.get('x-ekodi-authority-scope'),'user');
  assert.match(response.headers.get('x-robots-tag')||'',/noindex/i);
  assert.match(response.headers.get('cache-control')||'',/no-store/);
  assert.match(html,/data-ekodi-surface="church-member-home"/);
  assert.match(html,/내 교회 공간/);
  assert.match(html,/My EKODI/);
  assert.match(html,/교회 관리자/);
  assert.doesNotMatch(html,/church_care_tasks|church_staff|SUPABASE|access_token|service_role/i);
});

test('apex router owns church member home before public workspace fallback', async () => {
  const response=await router.fetch(new Request('https://ekodi.kr/ekodichurch/my'),{},{waitUntil(){}});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-route'),'church-member-home');
  const html=await response.text();
  assert.match(html,/에코디교회 마이페이지/);
  assert.doesNotMatch(html,/WELCOME TO EKODI CHURCH/);
});
