import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('tax.ekodi.kr is a shared-worker custom domain', async () => {
  const wrangler = await read('wrangler.site.toml');
  assert.match(wrangler, /pattern = "tax\.ekodi\.kr"\s+custom_domain = true/);
  const manifest = await read('deploy/manifests/shared-site.worker.json');
  assert.match(manifest, /https:\/\/tax\.ekodi\.kr\//);
  assert.match(manifest, /EKODI Tax/);
});

test('tax portal reuses Finance Core instead of creating a parallel backend', async () => {
  const entry = await read('platform-router-entry-worker.js');
  assert.match(entry, /import financeEntryWorker from '\.\/finance-entry-worker\.js'/);
  assert.match(entry, /host===TAX_HOST&&url\.pathname\.startsWith\('\/api\/finance\/tax-'\)/);
  assert.match(entry, /TAX_SHARED_ASSETS/);
  assert.match(entry, /admin\.ekodi\.kr/);

  const portal = await read('tax-portal-worker.js');
  assert.match(portal, /기존 인증 · Finance API · D1 공유/);
  assert.match(portal, /유료 자동발행 기본 OFF/);
  assert.match(portal, /https:\/\/finance-api\.ekodi\.kr\/api\/finance\/tax-/);
  assert.match(portal, /input\.slice\('https:\/\/finance-api\.ekodi\.kr'\.length\)/);
});

test('tax portal exposes the focused professional service workflow', async () => {
  const portal = await read('tax-portal-worker.js');
  for (const marker of ['세금 · 증빙','FREE-FIRST','세금계산서','공급자','거래처','발행대장','홈택스 발행 → 완료기록']) {
    assert.ok(portal.includes(marker), `missing tax portal marker: ${marker}`);
  }
  assert.match(portal, /data-tax-action="new-invoice"/);
  assert.match(portal, /data-tax-action="suppliers"/);
  assert.match(portal, /\/api\/finance\/tax-customers\?organizationId=EKODIBIZ/);
});

test('central admin authentication allows only the explicit Tax return origin', async () => {
  const auth = await read('auth-site/admin-auth.js');
  assert.match(auth, /u\.origin==='https:\/\/tax\.ekodi\.kr'/);
  assert.match(auth, /u\.pathname==='\/'\|\|u\.pathname==='\/index\.html'/);
  assert.doesNotMatch(auth, /return rawReturn/);
});

test('Finance links to Tax and remains event-driven without perpetual polling', async () => {
  const finance = await read('finance-monitor.js');
  assert.match(finance, /https:\/\/tax\.ekodi\.kr\//);
  assert.match(finance, /세금 · 증빙 열기/);
  assert.doesNotMatch(finance, /setInterval\s*\(/);

  const postbuild = await read('scripts/admin-performance-postbuild.mjs');
  assert.match(postbuild, /data-panel="services"/);
  assert.match(postbuild, /data-panel="finance"/);
  assert.doesNotMatch(postbuild, /finance polling tail marker missing/);
});
