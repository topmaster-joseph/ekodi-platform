import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const token = String(process.env.E2E_ADMIN_TOKEN || '').trim();
if (!token) throw new Error('E2E_ADMIN_TOKEN is required');

const writeVerification = process.env.E2E_TAX_WRITE_VERIFY === '1';
const artifactsDir = path.resolve('artifacts/admin-authenticated-e2e');
const reportPath = path.join(artifactsDir, 'tax-surface.json');
await fs.mkdir(artifactsDir, { recursive: true });

let browser;
let page;
let fatal = null;
let result = null;
let currentStage = 'bootstrap';
const stage = value => { currentStage = value; console.log(`[E2E:tax-surface] stage=${value}`); };

async function readProfile(profileId) {
  return page.evaluate(async id => {
    const auth = sessionStorage.getItem('ekodi-auth-token') || '';
    const response = await fetch('/api/finance/tax-profiles?organizationId=EKODIBIZ', {
      headers: { accept: 'application/json', authorization: `Bearer ${auth}` },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    const profile = Array.isArray(payload.profiles)
      ? payload.profiles.find(item => Number(item.id) === Number(id))
      : null;
    return { status: response.status, profile };
  }, profileId);
}

try {
  stage('browser');
  browser = await chromium.launch({ headless: true, timeout: 20_000 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  context.setDefaultTimeout(8_000);
  context.setDefaultNavigationTimeout(15_000);
  page = await context.newPage();

  stage('authenticated-entry');
  const entry = `https://tax.ekodi.kr/#ekodi_admin_token=${encodeURIComponent(token)}`;
  await page.goto(entry, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  if (new URL(page.url()).hostname !== 'tax.ekodi.kr') throw new Error(`tax-surface: wrong destination ${page.url()}`);

  stage('session-handoff');
  await page.waitForFunction(() => Boolean(sessionStorage.getItem('ekodi-auth-token')) && location.hash === '', null, { timeout: 15_000 });
  await page.waitForFunction(() => document.querySelector('#notice')?.classList.contains('good'), null, { timeout: 15_000 });

  if (writeVerification) {
    stage('suppliers-tab');
    const suppliersTab = page.locator('button[data-tab="suppliers"]');
    await suppliersTab.waitFor({ state: 'visible', timeout: 10_000 });
    await suppliersTab.click({ noWaitAfter: true, timeout: 5_000 });
    await page.waitForFunction(() => {
      const view = document.querySelector('[data-view="suppliers"]');
      return Boolean(view && !view.classList.contains('hidden'));
    }, null, { timeout: 5_000 });
  }

  stage('authenticated-read');
  const edit = page.locator('button[data-edit-supplier]').first();
  await edit.waitFor({ state: writeVerification ? 'visible' : 'attached', timeout: 10_000 });
  const profileId = Number(await edit.getAttribute('data-edit-supplier'));
  if (!Number.isInteger(profileId) || profileId <= 0) throw new Error('tax-surface: invalid supplier profile id');
  const before = await readProfile(profileId);
  if (before.status !== 200 || !before.profile) throw new Error(`tax-surface: authenticated supplier read failed HTTP ${before.status}`);

  if (!writeVerification) {
    result = {
      id: 'tax', group: 'operations', ok: true, destination: 'https://tax.ekodi.kr/',
      tokenHandoffVerified: true, authenticatedReadStatus: before.status,
      supplierProfileId: profileId, supplierSaveVerification: 'not-requested',
      isolatedTaxSurfaceVerification: true,
    };
  } else {
    stage('supplier-edit');
    await edit.click({ noWaitAfter: true, timeout: 5_000 });
    const modal = page.locator('#modal');
    await modal.waitFor({ state: 'visible', timeout: 8_000 });
    const modalTitle = String(await page.locator('#modalTitle').textContent() || '').trim();
    if (modalTitle !== '공급자 수정') throw new Error(`tax-surface: supplier edit modal mismatch: ${modalTitle}`);

    const save = page.locator('#supplierSave');
    await save.waitFor({ state: 'visible', timeout: 5_000 });
    const writeResponse = page.waitForResponse(response => {
      try {
        const url = new URL(response.url());
        return response.request().method() === 'PUT' && url.pathname === `/api/finance/tax-profiles/${profileId}`;
      } catch { return false; }
    }, { timeout: 12_000 });
    await save.click({ noWaitAfter: true, timeout: 5_000 });
    const response = await writeResponse;
    if (response.status() !== 200) {
      const payload = await response.text().catch(() => '');
      throw new Error(`tax-surface: supplier UI save returned HTTP ${response.status()} ${payload.slice(0, 180)}`);
    }
    await modal.waitFor({ state: 'hidden', timeout: 10_000 });
    await page.waitForFunction(() => document.querySelector('#notice')?.classList.contains('good'), null, { timeout: 10_000 });

    stage('supplier-readback');
    const after = await readProfile(profileId);
    if (after.status !== 200 || !after.profile) throw new Error(`tax-surface: supplier readback failed HTTP ${after.status}`);
    const fields = ['profileName','corpNum','taxRegId','corpName','ceoName','addr','bizType','bizClass','contactName','tel','email','isDefault','active'];
    const changed = fields.filter(key => JSON.stringify(before.profile[key] ?? null) !== JSON.stringify(after.profile[key] ?? null));
    if (changed.length) throw new Error(`tax-surface: value-preserving save changed fields: ${changed.join(',')}`);

    result = {
      id: 'tax', group: 'operations', ok: true, destination: 'https://tax.ekodi.kr/',
      tokenHandoffVerified: true, authenticatedReadStatus: before.status,
      supplierProfileId: profileId, supplierSaveVerification: 'passed',
      writeStatus: response.status(), persistenceReadbackStatus: after.status,
      persistenceVerified: true, comparedFieldCount: fields.length,
      isolatedTaxSurfaceVerification: true,
    };
  }
} catch (error) {
  fatal = error;
  console.error(`[E2E:tax-surface] fatal stage=${currentStage} ${error?.stack || error}`);
} finally {
  await fs.writeFile(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    passed: !fatal,
    lastStage: currentStage,
    result,
    error: fatal ? String(fatal?.stack || fatal?.message || fatal) : null,
  }, null, 2));
  if (browser) await browser.close().catch(() => {});
}

if (fatal) throw fatal;
console.log('[E2E:tax-surface] passed');
