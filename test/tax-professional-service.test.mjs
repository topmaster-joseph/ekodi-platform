import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('multi-supplier migration is additive and preserves legacy tax profile data', async () => {
  const sql = await read('migrations/0042_finance_multi_tax_suppliers.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS finance_tax_supplier_profiles/);
  assert.match(sql, /INSERT OR IGNORE INTO finance_tax_supplier_profiles/);
  assert.match(sql, /FROM finance_tax_profiles/);
  assert.doesNotMatch(sql, /DROP TABLE/i);
  assert.doesNotMatch(sql, /ALTER TABLE\s+finance_tax_profiles/i);
});

test('new supplier becomes default only after successful insert', async () => {
  const source = await read('tax-service-worker.js');
  assert.match(source, /const first = existing\.length === 0/);
  assert.match(source, /first \? 1 : 0/);
  assert.match(source, /if \(!first && body\.isDefault === true\) await setDefault/);
  assert.match(source, /같은 사업자번호와 종사업장번호의 공급자가 이미 등록/);
});

test('Finance namespace routes every tax endpoint through shared Tax service', async () => {
  const source = await read('finance-entry-worker.js');
  assert.match(source, /import taxServiceWorker from '\.\/tax-service-worker\.js'/);
  assert.match(source, /tax_supplier_profiles: 'finance_tax_supplier_profiles'/);
  assert.match(source, /pathname\.startsWith\('\/api\/finance\/tax-'\)/);
});

test('Tax portal is focused, FREE-FIRST and handles core tax workflows', async () => {
  const source = await read('tax-portal-worker.js');
  for (const marker of ['EKODI Tax','세금 · 증빙','FREE-FIRST','기본 비용 0원 경로','세금계산서','공급자','거래처','발행대장']) {
    assert.ok(source.includes(marker), `missing tax portal marker: ${marker}`);
  }
  assert.match(source, /\/api\/finance\/tax-profiles/);
  assert.match(source, /\/api\/finance\/tax-invoices/);
  assert.match(source, /manual-issued/);
  assert.match(source, /readiness\.automationEnabled/);
  assert.match(source, /유료 API 자동발행은 비활성화/);
});

test('Tax host uses same-origin API and explicit central-auth return target', async () => {
  const router = await read('platform-router-entry-worker.js');
  assert.match(router, /const TAX_HOST='tax\.ekodi\.kr'/);
  assert.match(router, /url\.pathname\.startsWith\('\/api\/finance\/tax-'\)/);
  assert.match(router, /financeEntryWorker\.fetch\(request,env,ctx\)/);
  const auth = await read('auth-site/admin-auth.js');
  assert.match(auth, /u\.origin==='https:\/\/tax\.ekodi\.kr'/);
  assert.match(auth, /u\.pathname==='\/'\|\|u\.pathname==='\/index\.html'/);
  const wrangler = await read('wrangler.site.toml');
  assert.match(wrangler, /pattern = "tax\.ekodi\.kr"\s+custom_domain = true/);
});

test('Finance no longer owns Health polling and links to EKODI Tax', async () => {
  const source = await read('finance-monitor.js');
  assert.match(source, /https:\/\/tax\.ekodi\.kr\//);
  assert.match(source, /세금 · 증빙 열기/);
  assert.doesNotMatch(source, /monitor-status\.json/);
  assert.doesNotMatch(source, /setInterval\s*\(/);
});

test('Creator Billing belongs to Books and is not loaded by Finance', async () => {
  const author = await read('author-billing-admin.js');
  assert.match(author, /#booksAdminSection/);
  assert.match(author, /\[data-books-pane="finance"\]/);
  assert.doesNotMatch(author, /#financeTitle/);
  const loader = await read('admin-demand-loader.js');
  const financeStart = loader.indexOf('function bindBaseEnhancements()');
  const requestedStart = loader.indexOf('function requestedFeature()');
  const installStart = loader.indexOf('function install()');
  const authStart = loader.indexOf('onAuthState();', installStart);
  assert.ok(financeStart >= 0 && requestedStart > financeStart && installStart > requestedStart && authStart > installStart);
  assert.doesNotMatch(loader.slice(financeStart, requestedStart), /author-billing/);
  const booksBinding = loader.slice(installStart, authStart);
  assert.match(booksBinding, /author-billing-admin\.css/);
  assert.match(booksBinding, /author-billing-admin\.js/);
});

test('Admin registry exposes Tax as an external professional service', async () => {
  const registry = await read('admin-menu-registry.js');
  const runtime = await read('admin-menu-runtime.js');
  assert.match(registry, /id: 'tax'/);
  assert.match(registry, /https:\/\/tax\.ekodi\.kr\//);
  assert.match(registry, /세금 · 증빙/);
  assert.match(runtime, /ensureExternalMenuItems/);
});

test('shared deployment manifest verifies Tax portal', async () => {
  const manifest = await read('deploy/manifests/shared-site.worker.json');
  assert.match(manifest, /https:\/\/tax\.ekodi\.kr\//);
  assert.match(manifest, /EKODI Tax/);
  assert.match(await read('auth-site/admin-auth.js'), /u\.origin==='https:\/\/tax\.ekodi\.kr'/);
});

test('changed JavaScript sources pass syntax checks', async () => {
  for (const file of ['tax-service-worker.js','tax-portal-worker.js','finance-entry-worker.js','finance-monitor.js','platform-router-entry-worker.js','author-billing-admin.js','admin-demand-loader.js','admin-menu-registry.js','admin-menu-runtime.js','auth-site/admin-auth.js']) {
    execFileSync(process.execPath, ['--check', file], { cwd:new URL('..', import.meta.url), stdio:'pipe' });
  }
});
