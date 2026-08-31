import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [features, adminJs, adminCss, domainsJs, domainsCss, build, worker] = await Promise.all([
  readFile(new URL('../control-center-features.js', import.meta.url), 'utf8'),
  readFile(new URL('../google-admin-auth.js', import.meta.url), 'utf8'),
  readFile(new URL('../google-admin-auth.css', import.meta.url), 'utf8'),
  readFile(new URL('../domains-hub.js', import.meta.url), 'utf8'),
  readFile(new URL('../domains-hub.css', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../site-worker.js', import.meta.url), 'utf8'),
]);

test('sidebar uses short Admin and Domains labels', () => {
  assert.ok(features.includes("placeholder('admins', '◈', 'Admin')"));
  assert.ok(features.includes("placeholder('domains', '◎', 'Domains')"));
  assert.ok(features.includes("setShortLabel('admins', 'Admin')"));
  assert.ok(features.includes("setShortLabel('domains', 'Domains')"));
});

test('Admin screen uses top preregistration toolbar, two-column account cards and guarded permission removal', () => {
  assert.ok(adminJs.includes('google-admin-toolbar'));
  assert.ok(adminJs.includes('google-admin-filters'));
  assert.ok(adminJs.includes('google-admin-bulk'));
  assert.ok(adminCss.includes('.google-admin-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'));
  assert.ok(adminJs.includes('최소 1명의 활성 최고관리자는 반드시 유지해야 합니다.'));
  assert.ok(adminJs.includes("method: 'DELETE'"));
  assert.ok(adminJs.includes('마지막 활성 최고관리자는 제거할 수 없습니다.'));
  assert.ok(adminJs.includes('현재 로그인한 최고관리자 자신의 권한은 제거할 수 없습니다.'));
  assert.ok(adminJs.includes('Google 계정과 고객사이트 로컬 역할은 삭제되지 않습니다.'));
});

test('Domains is a read-first service control hub, not a browser DNS editor', () => {
  assert.ok(domainsJs.includes("api('/api/control/overview')"));
  assert.ok(domainsJs.includes("api('/api/control/cloudflare-accounts')"));
  assert.ok(domainsJs.includes('Services에서 관리 →'));
  assert.equal(domainsJs.includes('/api/dns'), false);
  assert.equal(domainsJs.includes("method: 'PUT'"), false);
  assert.equal(domainsJs.includes("method: 'POST'"), false);
});

test('Domains separates Development and Production without exposing Cloudflare account identifiers', () => {
  assert.ok(domainsJs.includes('개발 Development'));
  assert.ok(domainsJs.includes('운영 Production'));
  assert.ok(domainsJs.includes("branch: 'development'"));
  assert.ok(domainsJs.includes("branch: 'main'"));
  assert.ok(domainsJs.includes('workers.dev · 격리 스테이징'));
  assert.ok(domainsJs.includes('*.ekodi.kr · canonical'));
  assert.ok(domainsJs.includes('운영 승격은 guarded release를 통해서만 수행합니다.'));
  assert.equal(domainsJs.includes('accountId'), false);
  assert.equal(domainsJs.includes('CLOUDFLARE_ACCOUNT_ID'), false);
  assert.equal(domainsJs.includes('CLOUDFLARE_API_TOKEN'), false);
  assert.ok(domainsCss.includes('.domains-environment-grid'));
  assert.ok(domainsCss.includes('.environment-card.development'));
  assert.ok(domainsCss.includes('.environment-card.production'));
});

test('Domains assets are built and receive admin edge security headers', () => {
  for (const asset of ['domains-hub.css', 'domains-hub.js']) {
    assert.ok(build.includes(`'${asset}'`), `${asset} must be copied into dist`);
    assert.ok(worker.includes(`'/${asset}'`), `${asset} must be treated as an admin asset`);
  }
});
