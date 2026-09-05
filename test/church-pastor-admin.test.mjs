import test from 'node:test';
import assert from 'node:assert/strict';
import { churchPastorAdminPage, churchPastorAdminScript, isChurchPastorAdminPath } from '../church-pastor-admin-page.js';

test('pastor admin route is scoped to ekodi-church', () => {
  assert.equal(isChurchPastorAdminPath('/ekodi-church/admin'), true);
  assert.equal(isChurchPastorAdminPath('/ekodi-church/admin/care'), true);
  assert.equal(isChurchPastorAdminPath('/ekodi-church/admin/access/extra'), false);
  assert.equal(isChurchPastorAdminPath('/ekodibiz/admin'), false);
  assert.equal(isChurchPastorAdminPath('/other-church/admin'), false);
});

test('pastor admin page is private-by-default', async () => {
  const response = churchPastorAdminPage();
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.match(html, /church-pastor-admin\.js/);
  assert.match(html, /목회자 운영/);
  assert.match(response.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
});

test('pastor admin client enforces church staff lookup before data modules', async () => {
  const response = churchPastorAdminScript();
  const source = await response.text();
  assert.match(source, /church_staff/);
  assert.match(source, /active=eq\.true/);
  assert.match(source, /권한이 없습니다/);
  assert.match(source, /church_care_tasks/);
  assert.match(source, /senior_pastor/);
});
