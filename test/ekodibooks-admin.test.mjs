import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { legacyAdminAliasTarget } from '../admin-address-policy.js';
import { isEkodiBooksAdminPath, ekodiBooksAdminPage, ekodiBooksAdminShellScript } from '../ekodibooks-admin-page.js';
import { getAdminMenuItem } from '../admin-menu-registry.js';
import { ekodiBizAdminScopeForPath, EKODIBIZ_ADMIN_SCOPES } from '../ekodibiz-admin-registry.js';

test('EKODI Books has a dedicated canonical admin surface and task menu', async () => {
  assert.equal(isEkodiBooksAdminPath('/ekodibooks/admin'), true);
  assert.equal(isEkodiBooksAdminPath('/ekodibooks/admin/distribution'), true);
  assert.equal(isEkodiBooksAdminPath('/admin/content/books'), false);

  const page = await ekodiBooksAdminPage().text();
  for (const label of ['운영 홈','출판 파이프라인','출판물 관리','매출 · 비용','인세 · 지급','배포 · 채널','출판 상담','요금 · 서비스','기능 설정']) {
    assert.ok(page.includes(label), label);
  }
  assert.match(page, /data-books-route="pipeline"/);
  assert.match(page, /data-books-route="distribution"/);
  assert.match(page, /\/ekodibooks\/admin\/_shell\.js/);

  const shell = await ekodiBooksAdminShellScript().text();
  assert.match(shell, /const BASE='\/ekodibooks\/admin'/);
  assert.match(shell, /history\.pushState/);
  assert.match(shell, /addEventListener\('popstate'/);
});

test('central and EKODIBIZ Books entries hand off to the dedicated admin', async () => {
  assert.equal(legacyAdminAliasTarget('/admin/content/books'), '/ekodibooks/admin');
  assert.equal(legacyAdminAliasTarget('/admin/content/books/finance'), '/ekodibooks/admin/finance');
  assert.equal(legacyAdminAliasTarget('/admin/services/books'), '/ekodibooks/admin');

  const books = getAdminMenuItem('books');
  assert.equal(books?.href, 'https://ekodi.kr/ekodibooks/admin');
  assert.equal(books?.adminHandoff, true);
  assert.equal(books?.labels?.ko, '에코디서점');

  const scope = EKODIBIZ_ADMIN_SCOPES.find(item => item.id === 'books');
  assert.equal(scope?.adminHref, '/ekodibooks/admin?source=ekodibiz');
  assert.equal(ekodiBizAdminScopeForPath('/ekodibooks/admin/royalties'), 'books');

  const menuLayout = await fs.readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
  assert.match(menuLayout, /definition\?\.href&&definition\.adminHandoff===true/);
});

test('platform routers serve EKODI Books before generic workspace admin routing', async () => {
  const [entry, site] = await Promise.all([
    fs.readFile(new URL('../platform-router-entry-worker.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../site-worker.js', import.meta.url), 'utf8'),
  ]);
  for (const source of [entry, site]) {
    assert.match(source, /ekodibooks-admin-page\.js/);
    assert.match(source, /\/ekodibooks\/admin\/_shell\.js/);
    const dedicated = source.indexOf('isEkodiBooksAdminPath(url.pathname)');
    const generic = source.indexOf('isWorkspaceAdminPath(url.pathname)', dedicated);
    assert.ok(dedicated >= 0, 'dedicated books route must exist');
    assert.ok(generic === -1 || dedicated < generic, 'dedicated books route must run before generic workspace admin');
  }
});
