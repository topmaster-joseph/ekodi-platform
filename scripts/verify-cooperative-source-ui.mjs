// Source-only QA using EKODI's browser task policy. Every browser request is
// intercepted; this runner never reads or mutates a production database/session.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { normalizeTask } from './ekodi-background-browser-worker.mjs';
import { COOPERATIVES } from '../cooperative-registry.js';
import { routeCooperative } from '../cooperative-control.js';
import { fixture, authFetch } from '../test/helpers/cooperative-fixture.mjs';
import { loadCooperativeProject } from '../cooperative-store.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright') : 'playwright');
const artifactRoot = path.resolve('artifacts/cooperative-source-ui');
await fs.mkdir(artifactRoot, { recursive: true });
const f = fixture();
const tokens = { 'admin-jub': 'chair-jub@example.test', 'member-jub': 'member-jub@example.test', 'admin-open': 'chair-open@example.test' };
f.grant(COOPERATIVES[0], tokens['admin-jub'], 'owner');
f.grant(COOPERATIVES[0], tokens['member-jub'], 'member');
f.grant(COOPERATIVES[1], tokens['admin-open'], 'owner');
for (const [index, token] of [[0, 'admin-jub'], [1, 'admin-open']]) {
  const row = await loadCooperativeProject(f.db, COOPERATIVES[index]);
  row.state.founders[0].accountEmail = tokens[token];
  if (index === 0) row.state.founders[1].accountEmail = tokens['member-jub'];
  f.sqlite.prepare('UPDATE cooperative_projects SET snapshot_json=? WHERE workspace_id=?').run(JSON.stringify(row.state), COOPERATIVES[index].workspaceId);
}
const originalFetch = globalThis.fetch;
globalThis.fetch = authFetch(tokens);
const checks = [];
const pageErrors = [];
const responseErrors = [];
let refreshCount = 0;
const browser = await chromium.launch({ headless: true, ...(process.env.EKODI_CHROMIUM_EXECUTABLE ? { executablePath: process.env.EKODI_CHROMIUM_EXECUTABLE } : {}) });

async function contextFor(width, token = '') {
  const task = normalizeTask({ path: '/', deviceProfile: width < 500 ? 'mobile-portrait' : 'desktop', allowMutation: true });
  assert.equal(task.path, '/');
  const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 950 }, isMobile: width < 500, hasTouch: width < 500, acceptDownloads: true });
  if (token) await context.addInitScript(value => {
    if (location.origin !== 'https://ekodi.kr' || window !== window.top) return;
    sessionStorage.setItem('ekodi-cooperative-auth.v1', JSON.stringify({ accessToken: value, refreshToken: value + '-refresh', expiresAt: Math.floor(Date.now()/1000)+3600 }));
  }, token);
  await context.route('**/*', async intercepted => {
    const incoming = intercepted.request();
    const url = new URL(incoming.url());
    if (url.hostname === 'renzehysxirjilvdxacv.supabase.co' && url.pathname === '/auth/v1/token') {
      refreshCount++;
      return intercepted.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: token, refresh_token: token + '-refresh', expires_in: 3600 }) });
    }
    if (url.origin !== 'https://ekodi.kr') return intercepted.fulfill({ status: 403, body: 'Source QA blocks all external browser requests.' });
    const headers = new Headers(await incoming.allHeaders());
    const request = new Request(incoming.url(), { method: incoming.method(), headers, ...(!['GET','HEAD'].includes(incoming.method()) ? { body: incoming.postData() } : {}) });
    const response = await routeCooperative(request, f.env);
    if (!response) return intercepted.fulfill({ status: 404, body: 'Source QA route not found' });
    if (response.status >= 500) responseErrors.push({ path: url.pathname, status: response.status });
    return intercepted.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  context.on('page', page => { page.on('pageerror', error => pageErrors.push(error.message)); });
  return context;
}

async function screenshot(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(artifactRoot, name + '.png'), fullPage: true });
}

try {
  for(const width of [1440,390]){
    const guest=await contextFor(width);const page=await guest.newPage();
    await page.goto('https://ekodi.kr/business-coop/');await page.waitForSelector('#gate:not([hidden])');assert.equal(await page.locator('#workspace').isVisible(),false);await guest.close();
    const owner=await contextFor(width,'admin-jub');const admin=await owner.newPage();
    await admin.goto('https://ekodi.kr/business-coop/');await admin.waitForSelector('[data-managed-cooperative]');assert.equal(await admin.locator('[data-managed-cooperative]').count(),1);
    assert.ok((await admin.locator('#workspace').innerText()).includes(COOPERATIVES[0].name));assert.equal((await admin.locator('#workspace').innerText()).includes(COOPERATIVES[1].name),false);
    assert.equal(await admin.locator('[data-managed-cooperative] a').first().getAttribute('href'),'/jubilee-distribution/admin');
    assert.equal(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await screenshot(admin,'cooperative-operations-'+width);checks.push({surface:'operations-hub-guest-and-scoped-owner',width,passed:true});await owner.close();
  }
  for (const width of [1440, 390, 320]) {
    const context = await contextFor(width);
    const page = await context.newPage();
    for (const coop of COOPERATIVES) {
      await page.goto('https://ekodi.kr/' + coop.slug + '/');
      await page.waitForSelector('#publicShare');
      assert.ok((await page.locator('h1').innerText()).includes('함께 여는 유통'));
      assert.ok(await page.locator('.brand').innerText().then(text => text.includes(coop.name)));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, coop.slug + ' public horizontal overflow');
      assert.equal(await page.locator('body').innerText().then(text => text.includes(coop.representatives[1])), false);
      await screenshot(page, coop.slug + '-public-' + width);
      checks.push({ surface: 'public', slug: coop.slug, width, passed: true });
      for (const surface of ['members', 'admin']) {
        await page.goto('https://ekodi.kr/' + coop.slug + '/' + surface);
        await page.waitForSelector('#gate:not([hidden])');
        assert.equal(await page.locator('#workspace').isVisible(), false);
        const login = new URL(await page.locator('#loginLink').getAttribute('href'));
        assert.equal(login.searchParams.get('return_to'), 'https://ekodi.kr/' + coop.slug + '/' + surface);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        checks.push({ surface: surface + '-guest-gate', slug: coop.slug, width, passed: true });
      }
    }
    await context.close();
  }

  for (const [index, token] of [[0, 'admin-jub'], [1, 'admin-open']]) {
    for (const width of [1440, 390]) {
      const coop = COOPERATIVES[index];
      const context = await contextFor(width, token);
      const page = await context.newPage();
      await page.goto('https://ekodi.kr/' + coop.slug + '/admin');
      await page.waitForSelector('#workspace:not([hidden])');
      assert.ok(await page.locator('#workspace').innerText().then(text => text.includes('서버 저장')));
      await page.getByRole('tab', { name: '조합정보', exact: true }).click();
      await page.locator('#profileForm [name="purpose"]').fill('저장 전 다른 탭의 목적 입력 유지');
      await page.getByRole('tab', { name: '구성원·사업자', exact: true }).click();
      await page.locator('#foundersForm [data-key="business"]').first().fill(coop.name + ' 테스트 사업체');
      // The token is expired deliberately; the existing refresh contract must recover.
      await page.evaluate(() => { const key = 'ekodi-cooperative-auth.v1'; const data = JSON.parse(sessionStorage.getItem(key)); data.expiresAt = 1; sessionStorage.setItem(key, JSON.stringify(data)); });
      await page.locator('#foundersForm button[type="submit"]').click();
      await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('저장되었습니다.'));
      const state = await loadCooperativeProject(f.db, coop);
      assert.equal(state.state.founders[0].business, coop.name + ' 테스트 사업체');
      await page.getByRole('tab', { name: '조합정보', exact: true }).click();
      assert.equal(await page.locator('#profileForm [name="purpose"]').inputValue(), '저장 전 다른 탭의 목적 입력 유지');
      await page.locator('#profileForm button[type="submit"]').click();
      await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('저장되었습니다.'));
      await page.getByRole('tab', { name: '공지', exact: true }).click();
      await page.locator('#noticeForm [name="title"]').fill(coop.name + ' 공지 초안');
      await page.locator('#noticeForm [name="body"]').fill('검토 후 공개할 공지입니다.');
      await page.locator('#noticeForm button[type="submit"]').click();
      await page.waitForSelector('[data-edit="notices"]');
      await page.locator('[data-edit="notices"]').last().click();
      await page.locator('#noticeForm [name="visibility"]').selectOption('public');
      await page.locator('#noticeForm [name="status"]').selectOption('published');
      await page.locator('#noticeForm button[type="submit"]').click();
      await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('저장되었습니다.'));
      assert.ok((await loadCooperativeProject(f.db, coop)).state.notices.some(n => n.status === 'published' && n.visibility === 'public'));
      await page.getByRole('tab', { name: '설립서류', exact: true }).click();
      await screenshot(page, coop.slug + '-admin-' + width);
      await page.getByRole('tab', { name: '현황', exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      checks.push({ surface: 'admin-save-refresh-draft-preservation-publication', slug: coop.slug, width, passed: true });
      await context.close();
    }
  }

  const context = await contextFor(390, 'member-jub');
  const page = await context.newPage();
  await page.goto('https://ekodi.kr/jubilee-distribution/members');
  await page.waitForSelector('#myBusinessForm');
  await page.locator('#myBusinessForm [name="business"]').fill('조합원 직접 등록 사업체');
  await page.locator('#myBusinessForm button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('나의 사업정보가 저장'));
  assert.equal((await loadCooperativeProject(f.db, COOPERATIVES[0])).state.founders[1].business, '조합원 직접 등록 사업체');
  await screenshot(page, 'jubilee-distribution-member-390');
  await page.goto('https://ekodi.kr/open-distribution/members');
  await page.waitForSelector('#gate:not([hidden])');
  assert.equal(await page.locator('#workspace').isVisible(), false);
  await page.goto('https://ekodi.kr/jubilee-distribution/admin');
  await page.waitForSelector('#gate:not([hidden])');
  assert.equal(await page.locator('#workspace').isVisible(), false);
  checks.push({ surface: 'member-self-edit-cross-coop-and-admin-denied', width: 390, passed: true });
  await context.close();
  assert.ok(refreshCount >= 4);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(responseErrors, []);
  const report = { ok: true, evidenceScope: 'source-only', productionVerified: false, engine: 'EKODI Chromium browser task policy', liveRequestsAllowed: false, checks, refreshCount, pageErrors, responseErrors };
  await fs.writeFile(path.join(artifactRoot, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, evidenceScope: report.evidenceScope, checks: checks.length, refreshCount, artifactRoot }));
} finally {
  await browser.close(); globalThis.fetch = originalFetch; f.sqlite.close();
}
