import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const token = String(process.env.E2E_ADMIN_TOKEN || '').trim();
if (!token) throw new Error('E2E_ADMIN_TOKEN is required');

const adminOrigin = 'https://ekodi.kr';
const baseUrl = `${adminOrigin}/admin/`;
const targetUrl = `${adminOrigin}/admin/services/service-modules`;
const authEntryUrl = `${baseUrl}?route=finance#ekodi_admin_token=${token}`;
const artifactsDir = path.resolve('artifacts/admin-authenticated-e2e');
const reportPath = path.join(artifactsDir, 'service-modules-direct-route.json');
await fs.mkdir(artifactsDir, { recursive: true });

const profiles = [
  { id:'desktop', viewport:{ width:1440, height:1100 }, isMobile:false },
  { id:'mobile', viewport:{ width:390, height:844 }, isMobile:true },
];

const results = [];
let browser;
let fatal = null;

async function waitForAdminReady(page) {
  await page.waitForFunction(() => sessionStorage.getItem('ekodi-auth-token'), null, { timeout:15_000 });
  await page.waitForSelector('#app:not([hidden])', { timeout:15_000 });
  await page.waitForFunction(() => window.EKODIAdminPanels && window.EKODIAdminSidebar, null, { timeout:15_000 });
  await page.waitForFunction(() => document.querySelector('#apiState')?.textContent?.includes('정상'), null, { timeout:15_000 });
}

async function readModuleState(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('#commonServicesPanel');
    const title = document.querySelector('#commonServicesTitle');
    const groups = [...document.querySelectorAll('#commonServicesPanel .module-service-group')];
    const cards = [...document.querySelectorAll('#commonServicesPanel .common-service-card')];
    const commonGroup = groups.find(group => group.textContent?.includes('공통 서비스'));
    const professionalGroup = groups.find(group => group.textContent?.includes('전문 서비스'));
    const commonCards = commonGroup ? [...commonGroup.querySelectorAll('.common-service-card')] : [];
    const professionalCards = professionalGroup ? [...professionalGroup.querySelectorAll('.common-service-card')] : [];
    const lists = [...document.querySelectorAll('#commonServicesPanel .module-service-list')];
    const singleColumn = lists.length > 0 && lists.every(list => {
      const columns = getComputedStyle(list).gridTemplateColumns.trim();
      return columns && !columns.includes(' ');
    });
    const visible = Boolean(panel)
      && !panel.hidden
      && !panel.classList.contains('hidden-panel')
      && getComputedStyle(panel).display !== 'none'
      && getComputedStyle(panel).visibility !== 'hidden';
    const footers = cards.map(card => String(card.querySelector('.common-service-foot')?.textContent || '').replace(/\s+/g, ' ').trim());
    const panelText = String(panel?.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      pathname: location.pathname,
      currentSection: window.EKODIAdminPanels?.current?.() || '',
      visible,
      moduleHealthMode: Boolean(panel?.classList.contains('module-health-mode')),
      title: String(title?.textContent || '').trim(),
      groupCount: groups.length,
      cardCount: cards.length,
      commonCount: commonCards.length,
      professionalCount: professionalCards.length,
      coreExcluded: !panelText.includes('핵심 엔진') && panelText.includes('Core 제외'),
      activationRuntimeSeparated: footers.length > 0 && footers.every(text => text.includes('기능') && text.includes('런타임')),
      singleColumn,
      panelTextLength: panelText.length,
    };
  });
}

function assertModuleState(state, phase, profile) {
  if (state.pathname !== '/admin/services/service-modules') throw new Error(`${profile}/${phase}: direct route drifted to ${state.pathname}`);
  if (state.currentSection !== 'service-modules') throw new Error(`${profile}/${phase}: current section is ${state.currentSection || 'empty'}`);
  if (!state.visible || !state.moduleHealthMode) throw new Error(`${profile}/${phase}: module health panel is not visibly active`);
  if (state.title !== '공통·전문 모듈 점검') throw new Error(`${profile}/${phase}: unexpected title ${state.title}`);
  if (state.groupCount !== 2 || state.commonCount < 1 || state.professionalCount < 1) throw new Error(`${profile}/${phase}: common/professional groups are incomplete`);
  if (state.cardCount !== state.commonCount + state.professionalCount) throw new Error(`${profile}/${phase}: card grouping mismatch`);
  if (!state.coreExcluded) throw new Error(`${profile}/${phase}: Core exclusion contract failed`);
  if (!state.activationRuntimeSeparated) throw new Error(`${profile}/${phase}: activation/runtime status contract failed`);
  if (!state.singleColumn) throw new Error(`${profile}/${phase}: module list is not single-column`);
  if (state.panelTextLength < 40) throw new Error(`${profile}/${phase}: rendered content is too small`);
}

async function verifyProfile(profile) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    isMobile: profile.isMobile,
    hasTouch: profile.isMobile,
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const failedAssets = [];
  page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('requestfailed', request => {
    try {
      const url = new URL(request.url());
      if (url.hostname === 'ekodi.kr' && /\.(?:js|css)(?:$|\?)/.test(url.pathname + url.search)) {
        failedAssets.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'failed'}`);
      }
    } catch {}
  });

  try {
    await page.goto(authEntryUrl, { waitUntil:'domcontentloaded', timeout:15_000 });
    await waitForAdminReady(page);

    await page.goto(targetUrl, { waitUntil:'domcontentloaded', timeout:15_000 });
    await waitForAdminReady(page);
    await page.waitForFunction(() => {
      const panel = document.querySelector('#commonServicesPanel');
      return window.EKODIAdminPanels?.current?.() === 'service-modules'
        && panel
        && !panel.hidden
        && panel.classList.contains('module-health-mode')
        && document.querySelectorAll('#commonServicesPanel .module-service-group').length === 2;
    }, null, { timeout:15_000 });

    const direct = await readModuleState(page);
    assertModuleState(direct, 'direct', profile.id);

    await page.screenshot({
      path:path.join(artifactsDir, `service-modules-${profile.id}.png`),
      fullPage:true,
    });

    await page.reload({ waitUntil:'domcontentloaded', timeout:15_000 });
    await waitForAdminReady(page);
    await page.waitForFunction(() => window.EKODIAdminPanels?.current?.() === 'service-modules', null, { timeout:15_000 });
    const reload = await readModuleState(page);
    assertModuleState(reload, 'reload', profile.id);

    if (failedAssets.length) throw new Error(`${profile.id}: Admin JS/CSS request failures: ${failedAssets.join(' | ')}`);
    if (pageErrors.length) throw new Error(`${profile.id}: uncaught page errors: ${pageErrors.join(' | ')}`);
    const serious = consoleErrors.filter(text => /(?:TypeError|ReferenceError|SyntaxError|uncaught|failed to load module|blocked untrusted admin handoff)/i.test(text));
    if (serious.length) throw new Error(`${profile.id}: serious console errors: ${serious.join(' | ')}`);

    results.push({
      profile:profile.id,
      viewport:profile.viewport,
      direct,
      reload,
      diagnostics:{ pageErrors, consoleErrors:consoleErrors.slice(-30), failedAssets },
      passed:true,
    });
  } finally {
    await context.close().catch(() => {});
  }
}

try {
  browser = await chromium.launch({ headless:true, timeout:20_000 });
  for (const profile of profiles) await verifyProfile(profile);
} catch (error) {
  fatal = error;
  console.error(error?.stack || error);
} finally {
  if (browser) await browser.close().catch(() => {});
  await fs.writeFile(reportPath, JSON.stringify({
    generatedAt:new Date().toISOString(),
    targetUrl,
    passed:!fatal && results.length === profiles.length,
    expectedProfiles:profiles.length,
    checkedProfiles:results.length,
    results,
    error:fatal ? String(fatal?.stack || fatal?.message || fatal) : null,
  }, null, 2));
}

if (fatal) throw fatal;
console.log('Authenticated service-modules direct-route E2E passed for desktop and mobile.');
