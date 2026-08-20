import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('multi-supplier migration is additive and preserves the legacy supplier table', async () => {
  const migration = await source('migrations/0032_finance_multi_tax_suppliers.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS finance_tax_supplier_profiles/);
  assert.match(migration, /INSERT OR IGNORE INTO finance_tax_supplier_profiles/);
  assert.doesNotMatch(migration, /DROP TABLE/i);
  assert.doesNotMatch(migration, /ALTER TABLE finance_tax_profiles/i);
});

test('Finance routes selected suppliers through an independent supplier master', async () => {
  const entry = await source('finance-entry-worker.js');
  const worker = await source('tax-invoice-multi-supplier-worker.js');
  assert.match(entry, /tax_supplier_profiles: 'finance_tax_supplier_profiles'/);
  assert.match(entry, /tax-invoice-multi-supplier-worker\.js/);
  assert.match(worker, /\/api\/finance\/tax-profiles/);
  assert.match(worker, /supplierProfileId/);
  assert.match(worker, /invoicer_json/);
  assert.match(worker, /tax_invoice\.supplier\.select/);
  assert.match(worker, /multiSupplier: true/);
});

test('tax invoice admin supports supplier management, selection and supplier history filtering', async () => {
  const admin = await source('tax-invoice-multi-supplier-admin.js');
  assert.match(admin, /공급자 관리/);
  assert.match(admin, /공급자별 발행내역/);
  assert.match(admin, /supplierProfileId/);
  assert.match(admin, /기본 공급자/);
  assert.match(admin, /발행완료 기록/);
  assert.match(admin, /홈택스/);
});

test('served Finance bundle uses the multi-supplier workspace instead of the old singleton UI', async () => {
  const build = await source('scripts/build.mjs');
  assert.match(build, /tax-invoice-multi-supplier-admin\.js/);
  assert.match(build, /tax-invoice-multi-supplier-admin\.css/);
  const activeTaxBundle = build.match(/const \[financeBaseCss[\s\S]*?await writeFile\(`\$\{output\}finance-monitor\.js`/m)?.[0] || '';
  assert.doesNotMatch(activeTaxBundle, /readFile\(`\$\{root\}tax-invoice-admin\.js`/);
});

test('Finance no longer embeds ecosystem Health or Creator billing', async () => {
  const finance = await source('finance-monitor.js');
  const loader = await source('admin-demand-loader.js');
  assert.doesNotMatch(finance, /monitor-status\.json/);
  assert.doesNotMatch(finance, /ensureEcosystemPanel/);
  assert.doesNotMatch(finance, /ecosystemRequest/);
  assert.doesNotMatch(loader, /author-billing-admin\.js/);
  assert.doesNotMatch(loader, /author-billing-admin\.css/);
});

test('base admin sections do not leak full detail panels into Overview', async () => {
  const html = await source('control-center.html');
  assert.match(html, /data-panel="services" aria-labelledby="operationsTitle"/);
  assert.match(html, /data-panel="finance" aria-labelledby="financeTitle"/);
  assert.doesNotMatch(html, /data-panel="overview services" aria-labelledby="operationsTitle"/);
  assert.doesNotMatch(html, /data-panel="overview finance" aria-labelledby="financeTitle"/);
});

test('Finance separates tax, payments, accounting and structure into focused panes', async () => {
  const html = await source('control-center.html');
  for (const pane of ['tax', 'payments', 'accounting', 'structure']) {
    assert.match(html, new RegExp(`data-finance-pane="${pane}"`));
    assert.match(html, new RegExp(`data-finance-view="${pane}"`));
  }
  const finance = await source('finance-monitor.js');
  assert.match(finance, /financeView = 'tax'/);
  assert.match(finance, /financeView !== 'tax'/);
});

test('Workspace and Organization cards no longer duplicate dedicated operational menus', async () => {
  const html = await source('control-center.html');
  const workspace = html.match(/<section class="section" data-panel="workspace">[\s\S]*?<\/section>/)?.[0] || '';
  const organization = html.match(/<section class="section" data-panel="organization">[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(workspace, /cloud\.ekodi\.kr/);
  assert.doesNotMatch(workspace, /marketing\.ekodi\.kr/);
  assert.doesNotMatch(workspace, /cgma\.ekodi\.kr/);
  assert.doesNotMatch(workspace, /legacy#domains/);
  assert.match(organization, /biz\.ekodi\.kr/);
  assert.match(organization, /trade\.ekodi\.kr/);
  assert.doesNotMatch(organization, /pay\.ekodi\.kr/);
  assert.doesNotMatch(organization, /고급 관리 콘솔/);
});

test('dedicated dynamic workspaces keep their own panel boundaries', async () => {
  const contracts = [
    ['client-access.js', /dataset\.panel = 'clients'/],
    ['domains-hub.js', /dataset\.panel = 'domains'/],
    ['social-admin.js', /dataset\.panel = 'social'/],
    ['community-reports-admin.js', /dataset\.panel='community'/],
    ['books-admin.js', /dataset\.panel = 'books'/],
    ['work-admin.js', /dataset\.panel = 'work'/],
    ['marketing-ai-admin.js', /dataset\.panel = 'marketing-ai'/],
    ['system-health-admin.js', /dataset\.panel = SECTION/],
  ];
  for (const [file, pattern] of contracts) assert.match(await source(file), pattern, file);
});

test('new Finance and supplier modules pass syntax checks', () => {
  for (const file of [
    'tax-invoice-multi-supplier-worker.js',
    'tax-invoice-multi-supplier-admin.js',
    'finance-entry-worker.js',
    'finance-monitor.js',
    'admin-demand-loader.js',
    'scripts/build.mjs'
  ]) execFileSync(process.execPath, ['--check', `${root}${file}`], { stdio:'pipe' });
});
