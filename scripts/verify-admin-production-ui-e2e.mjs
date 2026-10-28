import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { adminMenuOrder, getAdminMenuForSection, getAdminMenuGroupForSection, getAdminMenuItem } from '../admin-menu-registry.js';

const ADMIN_URL = process.env.ADMIN_URL || 'https://ekodi.kr/admin/';
const SYNTHETIC_TOKEN = 'ekodi-production-ui-e2e';
const SYNTHETIC_EMAIL = 'production-ui-e2e@local.invalid';
const menuIds = adminMenuOrder();
const menus = menuIds.map(id => [id, getAdminMenuGroupForSection(id)]);
const workAreas = [...new Set(menus.map(([, group]) => group))];
const artifactsDir = path.resolve('artifacts/admin-production-ui-e2e');
await fs.mkdir(artifactsDir, { recursive:true });

if (menus.some(([id, group]) => !id || !group)) throw new Error('Admin menu registry contains an ungrouped visible menu');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(({ token, email }) => {
  sessionStorage.setItem('ekodi-auth-token', token);
  sessionStorage.setItem('ekodi-admin-email', email);
}, { token: SYNTHETIC_TOKEN, email: SYNTHETIC_EMAIL });

const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
const adminHttpErrors = [];
let sessionRouteHits = 0;
const retiredApiRequests = [];
const retiredApiHost = ['api','ekodi','kr'].join('.');
page.on('pageerror', error => pageErrors.push(String(error?.message || error)));
page.on('response', response => {
  if (response.status() < 400) return;
  try {
    const url = new URL(response.url());
    if (url.origin === new URL(ADMIN_URL).origin) adminHttpErrors.push({ path:url.pathname, status:response.status() });
  } catch {}
});
page.on('request', request => {
  try {
    if (new URL(request.url()).hostname === retiredApiHost) retiredApiRequests.push(request.url());
  } catch {}
});
page.on('console', message => {
  if (message.type() !== 'error' || /cloudflareinsights\.com\/beacon/i.test(message.text())) return;
  const text = message.text();
  consoleErrors.push(text);
  console.log(`[browser console] ${text}`);
});

// Admin session validation is canonically served through the apex Core route.
await page.route('https://ekodi.kr/api/session', async route => {
  sessionRouteHits += 1;
  await route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({
      ok: true,
      authenticated: true,
      email: SYNTHETIC_EMAIL,
      role: 'super_admin',
      roles: ['super_admin'],
      isSuperAdmin: true,
      permissions: ['*'],
    }),
  });
});

const syntheticJson = body => ({
  status: 200,
  contentType: 'application/json; charset=utf-8',
  headers: {
    'access-control-allow-origin': 'https://ekodi.kr',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'cache-control': 'no-store',
  },
  body: JSON.stringify(body),
});

// Invoice controls must be tested against deterministic, non-sensitive
// read-only fixtures. Never authenticate this synthetic browser to billing API.
await page.route('**/api/control/infra-costs', async route => {
  if (route.request().method() !== 'GET') throw new Error('Synthetic cost UI must not mutate production billing records');
  await route.fulfill(syntheticJson({
    ok: true,
    generatedAt: '2026-10-28T00:00:00Z',
    overview: { totalsMinorByCurrency:{USD:500,KRW:12000},unverified:1,overdue:0,dueSoon:0,renewSoon:0,budgetAlerts:[] },
    providers: [
      {id:'cloudflare',name:'Cloudflare',category:'호스팅·서버'},
      {id:'github',name:'GitHub',category:'개발·CI'},
    ],
    invoices: [
      {id:'fixture-cloudflare-1',provider:'cloudflare',invoice_number:'TEST-CF-001',account_label:'fixture cloud',amount_minor:500,currency:'USD',issued_on:'2026-10-25',due_on:'2026-10-30',status:'unverified'},
      {id:'fixture-github-1',provider:'github',invoice_number:'TEST-GH-002',account_label:'fixture github',amount_minor:12000,currency:'KRW',issued_on:'2026-10-24',due_on:'2026-10-29',status:'paid'},
    ],
    budgets: [], renewals: [], usage: [],
  }));
});
await page.route('**/api/control/overview', async route => {
  if (route.request().method() === 'OPTIONS') return route.fulfill(syntheticJson({ ok:true }));
  await route.fulfill(syntheticJson({ ok:true, services:[] }));
});
await page.route('https://ekodi.kr/ai/api/status', async route => {
  await route.fulfill(syntheticJson({
    ok:true,
    config:{ architectureVersion:'1.10.0', taskExecutionEnabled:false, branchAllocationEnabled:false },
    stateStore:'ready',
    providers:[],
  }));
});
await page.route('https://ekodi.kr/ai/api/tasks', async route => {
  await route.fulfill(syntheticJson({ tasks:[] }));
});
await page.route('https://ekodi.kr/ai/api/nodes', async route => {
  await route.fulfill(syntheticJson({ nodes:[] }));
});
await page.route('https://ekodi.kr/api/control/messenger/inbox', async route => {
  await route.fulfill(syntheticJson({ inbox:[] }));
});
await page.route('https://ekodi.kr/api/control/ai/actions?limit=20', async route => {
  await route.fulfill(syntheticJson({ actions:[] }));
});
await page.route('https://ekodi.kr/api/control/ai/v8/orchestrator/human-gates?limit=20', async route => {
  await route.fulfill(syntheticJson({ tasks:[] }));
});
// This synthetic UI-only session cannot access the real directory API. Mock only
// its read-only response; production authorization rules stay completely intact.
await page.route('**/api/customers/directory', async route => {
  if (!['GET','OPTIONS'].includes(route.request().method())) throw new Error('Synthetic directory cannot mutate data');
  await route.fulfill(syntheticJson({generatedAt:'2026-10-10T00:00:00Z',summary:{},authority:{},tenants:[],roles:[],members:[]}));
});
await page.route('https://ekodi.kr/api/control/ai/assist', async route => {
  if (route.request().method() !== 'POST') return route.fulfill(syntheticJson({ reply:'', mode:'free_assist' }));
  const body = route.request().postDataJSON();
  if (String(body?.message || '') !== '관리자 명령창 연결 확인') throw new Error(`Unexpected synthetic Assist message: ${String(body?.message || '')}`);
  await route.fulfill(syntheticJson({
    reply:'관리자 명령창 연결 정상',
    mode:'free_assist',
    provider:'production-e2e',
  }));
});

async function waitForAdminShell() {
  try {
    await page.waitForFunction(() => document.documentElement.dataset.ekodiAdminReady === 'true', null, { timeout: 30000 });
    await page.waitForFunction(() => window.EKODIAdminPanels && window.EKODIAdminSidebar, null, { timeout: 30000 });
    await page.waitForFunction(expected => document.querySelectorAll('button[data-admin-global-group]').length >= expected, workAreas.length, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('.admin-context-source .nav').length >= 1, null, { timeout: 30000 });
    await page.waitForFunction(() => Boolean(document.documentElement.dataset.ekodiDesignEngine) && document.documentElement.dataset.ekodiDesignAudit === 'pass', null, { timeout: 30000 });
  } catch (error) {
    // Diagnostic is deliberately read-only and credential-free: only booleans,
    // same-origin pathnames and bounded UI state are retained.
    const state = await page.evaluate(() => ({
      ready:document.documentElement.dataset.ekodiAdminReady || '',
      booting:document.documentElement.dataset.ekodiAdminBooting || '',
      bootAsset:document.documentElement.dataset.ekodiAdminBootAsset || '',
      degraded:document.documentElement.dataset.ekodiAdminDegraded || '',
      sessionDegraded:document.documentElement.dataset.ekodiSessionDegraded || '',
      appHidden:Boolean(document.querySelector('#app')?.hidden),
      loginVisible:Boolean(document.querySelector('#loginScreen') && !document.querySelector('#loginScreen').hidden),
      hasCore:Boolean(window.EKODIAdminCore),
      hasPanels:Boolean(window.EKODIAdminPanels),
      hasSidebar:Boolean(window.EKODIAdminSidebar),
      hasToken:Boolean(sessionStorage.getItem('ekodi-auth-token')),
      scripts:[...document.querySelectorAll('script[src]')].filter(node => node.src.startsWith(location.origin)).map(node => new URL(node.src).pathname).slice(0,20),
    })).catch(() => ({ unavailable:true }));
    const diagnostic = { state, sessionRouteHits, httpErrors:adminHttpErrors.slice(-10), pageErrorCount:pageErrors.length, consoleErrorCount:consoleErrors.length };
    console.error('[PROD-E2E] admin-shell-timeout ' + JSON.stringify(diagnostic));
    await page.screenshot({ path:path.join(artifactsDir, 'admin-boot-timeout.png'), fullPage:true }).catch(() => {});
    throw error;
  }
}

async function resetAdminShellIfPoisoned() {
  const state = await page.evaluate(() => {
    const app = document.querySelector('#app');
    const style = app ? getComputedStyle(app) : null;
    const rect = app?.getBoundingClientRect();
    return {
      ready: document.documentElement.dataset.ekodiAdminReady === 'true',
      panels: Boolean(window.EKODIAdminPanels),
      sidebar: Boolean(window.EKODIAdminSidebar),
      token: Boolean(sessionStorage.getItem('ekodi-auth-token')),
      visible: Boolean(app && !app.hidden && style?.display !== 'none' && style?.visibility !== 'hidden' && (rect?.width || 0) > 0 && (rect?.height || 0) > 0),
    };
  });
  if (state.ready && state.panels && state.sidebar && state.token && state.visible) return false;
  console.warn(`[PROD-E2E] Admin shell degraded; bounded reload recovery ${JSON.stringify(state)}`);
  await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await waitForAdminShell();
  return true;
}

const response = await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
if (!response || response.status() !== 200) throw new Error(`Admin entry returned ${response?.status() ?? 'no response'}`);
await waitForAdminShell();

const shellState = await page.evaluate(() => {
  const app = document.querySelector('#app');
  if (!app) return null;
  const style = getComputedStyle(app);
  const rect = app.getBoundingClientRect();
  return {
    hidden: app.hidden,
    display: style.display,
    visibility: style.visibility,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    shell: app.dataset.ekodiAdminShell || '',
  };
});
if (!shellState) throw new Error('Admin app element is missing');
if (shellState.hidden || shellState.display === 'none' || shellState.visibility === 'hidden' || shellState.width < 1 || shellState.height < 1) {
  throw new Error(`Admin shell is not rendered: ${JSON.stringify(shellState)}`);
}
if (shellState.shell !== 'shared-v2') throw new Error(`Admin shared shell did not install: ${JSON.stringify(shellState)}`);

const workbenchState = await page.evaluate(() => {
  const body = document.body;
  const app = document.querySelector('#app');
  const sidebar = document.querySelector('.sidebar');
  const nav = sidebar?.querySelector('nav');
  const workspace = app?.querySelector('main');
  const contextTabs = workspace?.querySelector(':scope>.admin-context-tabs-shell');
  const style = node => node ? getComputedStyle(node) : null;
  const sidebarRect = sidebar?.getBoundingClientRect();
  return {
    topOffset: parseFloat(style(body)?.paddingTop || '0'),
    bodyOverflowY: style(body)?.overflowY || '',
    appOverflowY: style(app)?.overflowY || '',
    sidebarOverflowY: style(sidebar)?.overflowY || '',
    navOverflowY: style(nav)?.overflowY || '',
    navIndependentScroll: nav?.dataset.ekodiIndependentScroll || '',
    workspaceOverflowY: style(workspace)?.overflowY || '',
    workspaceScrollOwner: workspace?.dataset.ekodiScrollOwner || '',
    contextTabsCount: contextTabs ? 1 : 0,
    commandEntryCount: nav?.querySelector('.admin-command-entry') ? 1 : 0,
    sidebarTop: sidebarRect ? Math.round(sidebarRect.top) : null,
    designAudit: document.documentElement.dataset.ekodiDesignAudit || '',
    designEngine: document.documentElement.dataset.ekodiDesignEngine || '',
  };
});
if (workbenchState.topOffset > 0.5) throw new Error(`Admin top offset leaked into production: ${JSON.stringify(workbenchState)}`);
if (workbenchState.bodyOverflowY !== 'hidden' || workbenchState.appOverflowY !== 'hidden') throw new Error(`Admin frame must be scroll-locked: ${JSON.stringify(workbenchState)}`);
if (workbenchState.sidebarOverflowY !== 'hidden' || !['auto','scroll'].includes(workbenchState.navOverflowY) || workbenchState.navIndependentScroll !== 'platform-admin') throw new Error(`Admin role-projected sidebar scroll contract failed: ${JSON.stringify(workbenchState)}`);
if (!['auto','scroll'].includes(workbenchState.workspaceOverflowY) || workbenchState.workspaceScrollOwner !== 'workspace') throw new Error(`Admin workspace content scroll contract failed: ${JSON.stringify(workbenchState)}`);
if (workbenchState.sidebarTop !== 0) throw new Error(`Admin fixed workbench geometry failed: ${JSON.stringify(workbenchState)}`);
if (workbenchState.contextTabsCount !== 0 || workbenchState.commandEntryCount !== 0) throw new Error(`Admin retired navigation DOM still exists: ${JSON.stringify(workbenchState)}`);
if (!workbenchState.designEngine || workbenchState.designAudit === 'fail') throw new Error(`Admin Design Engine did not activate cleanly: ${JSON.stringify(workbenchState)}`);
console.log(`ADMIN_WORKBENCH=${JSON.stringify(workbenchState)}`);
await page.screenshot({ path:path.join(artifactsDir,'admin-workbench.png'), fullPage:false });

const assetVersion = await page.locator('script[src*="admin-authenticated-shell.js?v="]').getAttribute('src').then(src => new URL(src, ADMIN_URL).searchParams.get('v'));
if (!assetVersion) throw new Error('Production Admin fingerprint is missing');
for (const asset of ['ekodi-message-ui.js', 'google-admin-auth.js']) {
  const assetResponse = await context.request.get(new URL(`${asset}?v=${encodeURIComponent(assetVersion)}`, ADMIN_URL).href, { timeout: 20000 });
  if (assetResponse.status() !== 200) throw new Error(`${asset} returned ${assetResponse.status()} for fingerprint ${assetVersion}`);
  const contentType = assetResponse.headers()['content-type'] || '';
  if (!/javascript|ecmascript|text\/plain/i.test(contentType)) throw new Error(`${asset} has non-script content type: ${contentType || '(missing)'}`);
}

const productionOrder = await page.evaluate(() => window.EKODIAdminPanels?.visibleMenuOrder || []);
if (productionOrder.length !== menuIds.length) throw new Error(`Production menu count drifted: registry=${menuIds.length}, production=${productionOrder.length}`);
for (const id of menuIds) if (!productionOrder.includes(id)) throw new Error(`Production menu registry missing ${id}`);

async function dispatchClick(locator, timeout = 10_000) {
  await locator.waitFor({ state: 'visible', timeout });
  await locator.evaluate(node => { node.click(); return true; });
}

async function dispatchAreaClick(locator, timeout = 10_000) {
  await locator.waitFor({ state: 'attached', timeout });
  await locator.evaluate(node => { node.click(); return true; });
}

async function resolveMenuTrigger(id, group) {
  // ADMIN-IA-V3: a section is either a menu entry (.admin-detail-item) or a
  // detail route nested under its open menu (.admin-detail-tab).
  const detail = page.locator(`button:is(.admin-detail-item,.admin-detail-tab)[data-admin-detail-section="${id}"]`).first();
  const menuId = getAdminMenuForSection(id)?.id || '';
  const menuButton = menuId ? page.locator(`button.admin-detail-item[data-admin-detail-menu="${menuId}"]`).first() : null;
  const more = page.locator(`button[data-admin-detail-more="${group}"]`).first();
  const groupButton = page.locator(`button[data-admin-global-group="${group}"]`).first();

  // Shared Admin groups can render a fallback section while a lazy module is
  // mounting. Re-select only the requested group; never click another menu,
  // fabricate a passing panel, or silently ignore an unavailable target.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await detail.isVisible().catch(() => false)) return detail;
    // The production sidebar exposes an idempotent sync API. Use it as a
    // bounded self-heal when lazy panel activation temporarily races the menu.
    await page.evaluate(() => window.EKODIAdminSidebar?.sync?.(document)).catch(() => false);
    if (await detail.isVisible().catch(() => false)) return detail;
    if (menuButton && await menuButton.isVisible().catch(() => false)) {
      // Open the owning menu so its nested detail routes render.
      await dispatchClick(menuButton, 8_000);
      try {
        await detail.waitFor({ state: 'visible', timeout: 5_000 });
        return detail;
      } catch {
        // Fall through to the group re-selection below.
      }
    }
    if (await more.isVisible().catch(() => false)) {
      const expanded = await page.locator('.sidebar nav').first()
        .getAttribute('data-admin-more-group').then(value => value === group).catch(() => false);
      if (!expanded) await dispatchClick(more, 8_000);
    }
    try {
      await detail.waitFor({ state: 'visible', timeout: 5_000 });
      return detail;
    } catch {
      // A menu that remains invisible is retried with the same group focus.
    }
    if (attempt < 2 && await groupButton.count().catch(() => 0)) {
      await dispatchAreaClick(groupButton, 8_000);
      await page.waitForTimeout(350);
    }
  }
  const diagnostic = await page.evaluate(() => {
    const nav = document.querySelector('.sidebar nav');
    return {
      focusedGroup:nav?.dataset.adminFocusedGroup || '',
      expandedGroup:nav?.dataset.adminMoreGroup || '',
      activeGroups:[...document.querySelectorAll('button[data-admin-global-group]')]
        .filter(node => node.getAttribute('aria-current') === 'page' || node.classList.contains('active'))
        .map(node => node.dataset.adminGlobalGroup),
    };
  });
  throw new Error(`${id}: no visible left-navigation trigger after selecting work area ${group}; ${JSON.stringify(diagnostic)}`);
}

const results = [];

async function verifyCommandConsoleRoundTrip() {
  console.log('[PROD-E2E] command-home: native Control embed begin');
  await page.waitForFunction(() =>
    window.EKODIAdminPanels?.current?.() === 'command-home'
    && document.body.classList.contains('admin-control-home')
    && Boolean(document.querySelector('#ekodiControlHomeFrame')), null, { timeout: 15000 });
  const frame=page.frameLocator('#ekodiControlHomeFrame');
  const input=frame.locator('#commandInput');
  await input.waitFor({state:'visible',timeout:15000});
  await frame.locator('#controlEmbeddedToolbar').waitFor({state:'visible',timeout:15000});
  await frame.locator('#controlRail').waitFor({state:'hidden',timeout:15000});
  await frame.locator('#controlEmbeddedToolbar [data-view="tasks"]').click();
  await frame.locator('#viewTasks').waitFor({state:'visible',timeout:5000});
  await frame.locator('#controlEmbeddedToolbar [data-view="chat"]').click();
  await input.waitFor({state:'visible',timeout:5000});
  await frame.locator('#executeNow').uncheck();
  await input.fill('관리자 명령창 연결 확인');
  await frame.locator('#sendButton').click();
  await frame.locator('#messages .turn.user .bubble').filter({hasText:'관리자 명령창 연결 확인'}).waitFor({state:'visible',timeout:12000});
  await frame.locator('#messages .turn.assistant .bubble').filter({hasText:'관리자 명령창 연결 정상'}).waitFor({state:'visible',timeout:12000});
  if(await input.inputValue()!=='')throw new Error('Control command input was not cleared');
  const geometry=await page.evaluate(()=>{
    const sidebar=document.querySelector('.sidebar'),embedded=document.querySelector('#ekodiControlHomeFrame');
    const rect=embedded?.getBoundingClientRect(),nav=sidebar?.getBoundingClientRect();
    return {pathname:location.pathname,frameWidth:rect?.width||0,frameHeight:rect?.height||0,frameLeft:rect?.left||0,sidebarRight:nav?.right||0,home:document.body.classList.contains('admin-control-home')};
  });
  if(geometry.pathname!=='/admin/'||!geometry.home||geometry.frameWidth<300||geometry.frameHeight<300||geometry.frameLeft<geometry.sidebarRight-2)throw new Error('Control workbench not aligned to right: '+JSON.stringify(geometry));
  results.push({id:'command-home',group:'summary',kind:'command-roundtrip',ok:true,detail:'native Control iframe command->reply'});
  console.log('[PROD-E2E] command-home: native Control command roundtrip passed');
}

await verifyCommandConsoleRoundTrip();

let selectedWorkArea = null;
for (const [id, group] of menus) {
  console.log(`[PROD-E2E] ${id}: begin`);
  // Delegated or lazily loaded sections may change the real active work area
  // without changing this loop's expected group. Check DOM on every navigation.
  const groupActive = () => page.evaluate(target => [...document.querySelectorAll('button[data-admin-global-group]')].some(
    node => node.dataset.adminGlobalGroup === target && (node.getAttribute('aria-current') === 'page' || node.classList.contains('active'))
  ), group);
  if (selectedWorkArea !== group || !await groupActive()) {
    const global = page.locator(`button[data-admin-global-group="${group}"]`).first();
    // ADMIN-LEFT-FLAT-MENU-001: area captions are not shown; the area control stays in
    // the DOM and is activated directly.
    await global.waitFor({ state: 'attached', timeout: 10000 });
    for (let attempt=0; attempt<2; attempt++) {
      if (!await groupActive()) await dispatchAreaClick(global);
      try {
        await page.waitForFunction(target => [...document.querySelectorAll('button[data-admin-global-group]')].some(
          node => node.dataset.adminGlobalGroup === target && (node.getAttribute('aria-current') === 'page' || node.classList.contains('active'))
        ), group, { timeout: 12000 });
        break;
      } catch (error) {
        if (attempt === 1) {
          const state = await page.evaluate(() => ({
            requestedSection:window.EKODIAdminPanels?.current?.() || '',
            routedSection:window.EKODIAdminRoutes?.sectionFromLocation?.(location) || '',
            focusedGroup:document.querySelector('.sidebar nav')?.dataset.adminFocusedGroup || '',
            activeGroups:[...document.querySelectorAll('button[data-admin-global-group]')]
              .filter(node => node.getAttribute('aria-current') === 'page' || node.classList.contains('active'))
              .map(node => node.dataset.adminGlobalGroup),
            selectedUrl:location.pathname + location.hash,
          }));
          throw new Error(`${id}: ${group} never activated after bounded retries: ${JSON.stringify(state)}`, { cause:error });
        }
      }
    }
    selectedWorkArea = group;
  }

  const definition = getAdminMenuItem(id);

  if (id === 'tax') {
    const source = page.locator('.admin-context-source .nav[data-section="tax"]');
    const href = await source.getAttribute('href');
    if (!href?.startsWith('https://ekodi.kr/tax')) throw new Error(`Tax handoff href is invalid: ${href}`);
    if (!page.url().startsWith(ADMIN_URL)) throw new Error(`Tax handoff verifier is not on canonical Admin: ${page.url()}`);
    const taxResponse = await context.request.get(href, { maxRedirects: 5, timeout: 20000 });
    if (taxResponse.status() < 200 || taxResponse.status() >= 400) throw new Error(`Tax handoff endpoint returned ${taxResponse.status()}`);
    results.push({ id, group, kind: 'handoff', ok: true, detail: href });
    console.log(`[PROD-E2E] ${id}: ok handoff-link ${href}`);
    continue;
  }

  if (id === 'work' && definition?.adminHandoff === true) {
    const source = page.locator('.admin-context-source .nav[data-section="work"]');
    const href = await source.getAttribute('href');
    const expected = new URL(definition.href, ADMIN_URL);
    if (!href || new URL(href, ADMIN_URL).href !== expected.href) throw new Error(`Work admin handoff href is invalid: ${href || '(missing)'}`);
    if (expected.href !== 'https://ekodi.kr/work/admin') throw new Error(`Work admin handoff target drifted: ${expected.href}`);
    if (!page.url().startsWith(ADMIN_URL)) throw new Error(`Work handoff verifier is not on canonical Admin: ${page.url()}`);
    const response = await context.request.get(expected.href, { maxRedirects: 5, timeout: 20000 });
    if (response.status() < 200 || response.status() >= 400) throw new Error(`Work admin handoff endpoint returned ${response.status()}`);
    results.push({ id, group, kind: 'handoff', ok: true, detail: expected.href });
    console.log(`[PROD-E2E] ${id}: ok handoff-link ${expected.href}`);
    continue;
  }

  if (definition?.href && definition.adminHandoff === true) {
    const expected = new URL(definition.href, ADMIN_URL);
    const source = page.locator(`.admin-context-source .nav[data-section="${id}"]`);
    const href = await source.getAttribute('href');
    if (!href || new URL(href, ADMIN_URL).href !== expected.href) throw new Error(`${id} admin handoff href is invalid: ${href || '(missing)'}`);
    if (!page.url().startsWith(ADMIN_URL)) throw new Error(`${id} handoff verifier is not on canonical Admin: ${page.url()}`);
    const response = await context.request.get(expected.href, { maxRedirects: 5, timeout: 20000 });
    if (response.status() < 200 || response.status() >= 400) throw new Error(`${id} admin handoff endpoint returned ${response.status()}`);
    results.push({ id, group, kind:'handoff', ok:true, detail:expected.href });
    console.log(`[PROD-E2E] ${id}: ok handoff-link ${expected.href}`);
    continue;
  }

  if (definition?.href && definition.adminHandoff !== true) {
    const expected = new URL(definition.href, ADMIN_URL);
    const source = page.locator(`.admin-context-source .nav[data-section="${id}"]`);
    const sourceHref = await source.getAttribute('href');
    if (!sourceHref || new URL(sourceHref, ADMIN_URL).href !== expected.href) throw new Error(`${id} direct href drifted: ${sourceHref || '(missing)'}`);
    const trigger = await resolveMenuTrigger(id, group);
    const popupPromise = page.waitForEvent('popup', { timeout: 10000 });
    await dispatchClick(trigger);
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded', { timeout: 20000 });
    const actual = new URL(popup.url());
    const normalizedPath = value => value.replace(/\/+$/, '') || '/';
    if (actual.origin !== expected.origin || normalizedPath(actual.pathname) !== normalizedPath(expected.pathname)) {
      await popup.close().catch(() => {});
      throw new Error(`${id} popup navigated to unexpected destination: ${actual.href}`);
    }
    const directResponse = await context.request.get(expected.href, { maxRedirects: 5, timeout: 20000 });
    if (directResponse.status() < 200 || directResponse.status() >= 400) {
      await popup.close().catch(() => {});
      throw new Error(`${id} direct href returned ${directResponse.status()}`);
    }
    if (!page.url().startsWith(ADMIN_URL)) throw new Error(`${id} direct href moved the canonical Admin page: ${page.url()}`);
    results.push({ id, group, kind: 'direct-href', ok: true, detail: expected.href });
    console.log(`[PROD-E2E] ${id}: ok direct-href ${expected.href}`);
    await popup.close();
    continue;
  }

  if (id !== 'command-home') {
    const alreadyActive = await page.evaluate(section => window.EKODIAdminPanels?.current?.() === section, id);
    if (!alreadyActive) {
      const trigger = await resolveMenuTrigger(id, group);
      await dispatchClick(trigger);
      try {
        await page.waitForFunction(section => window.EKODIAdminPanels?.current?.() === section, id, { timeout: 12000 });
      } catch {
        console.log(`[PROD-E2E] ${id}: activation retry after slow/lazy module response`);
        const retryTrigger = await resolveMenuTrigger(id, group);
        await dispatchClick(retryTrigger);
        await page.waitForFunction(section => window.EKODIAdminPanels?.current?.() === section, id, { timeout: 20000 });
      }
    }
  }
  try {
    await page.waitForFunction(section => window.EKODIAdminPanels?.current?.() === section, id, { timeout: 12000 });
  } catch (initialError) {
    // A lazy module may asynchronously select a fallback after the first
    // section click. Re-select the same real left-navigation item once,
    // without treating a hidden panel or a missing click as a success.
    if (id === 'command-home') throw initialError;
    const before = await page.evaluate(() => ({
      current:window.EKODIAdminPanels?.current?.()||'',
      route:location.pathname+location.hash,
      focused:document.querySelector('.sidebar nav')?.dataset.adminFocusedGroup||'',
    }));
    console.warn(`[PROD-E2E] ${id}: selected panel changed during mount; bounded real-navigation recovery ${JSON.stringify(before)}`);
    if (!await groupActive()) {
      const global = page.locator(`button[data-admin-global-group="${group}"]`).first();
      await dispatchAreaClick(global);
      await page.waitForFunction(target => [...document.querySelectorAll('button[data-admin-global-group]')].some(
        node => node.dataset.adminGlobalGroup===target && (node.getAttribute('aria-current')==='page'||node.classList.contains('active'))
      ), group, { timeout:12000 });
    }
    const retryTrigger = await resolveMenuTrigger(id,group);
    await dispatchClick(retryTrigger);
    try {
      await page.waitForFunction(section => window.EKODIAdminPanels?.current?.() === section, id, { timeout: 20000 });
    } catch {
      const after = await page.evaluate(() => ({
        current:window.EKODIAdminPanels?.current?.()||'',
        route:location.pathname+location.hash,
        focused:document.querySelector('.sidebar nav')?.dataset.adminFocusedGroup||'',
      }));
      throw new Error(`${id}: real menu activation did not stabilize after bounded retry: ${JSON.stringify({before,after})}`, {cause:initialError});
    }
  }

  if (id === 'command-home') {
    await page.waitForSelector('#ekodiControlHomeFrame', { state:'visible',timeout:12000 });
    const command=await page.evaluate(()=>{
      const frame=document.querySelector('#ekodiControlHomeFrame'),sidebar=document.querySelector('.sidebar');
      const rect=frame?.getBoundingClientRect(),nav=sidebar?.getBoundingClientRect();
      return { pathname:location.pathname,width:rect?.width||0,height:rect?.height||0,left:rect?.left||0,sidebarRight:nav?.right||0 };
    });
    if(command.pathname !== '/admin/'||command.width<300||command.height<300||command.left<command.sidebarRight-2)throw new Error('command-home did not render native EKODI Control right of sidebar: '+JSON.stringify(command));
    await page.frameLocator('#ekodiControlHomeFrame').locator('#controlEmbeddedToolbar').waitFor({state:'visible',timeout:12000});
    results.push({id,group,kind:'command-workbench',ok:true,detail:'native Control iframe with horizontal work tabs, no second rail'});
    await page.screenshot({path:path.join(artifactsDir,`menu-${id}.png`),fullPage:false});
    continue;
  }

  try {
    await page.waitForFunction(section => {
      const panels = [...document.querySelectorAll('.content [data-panel]')].filter(panel => String(panel.dataset.panel || '').split(/\s+/).includes(section));
      return panels.some(panel => !panel.hidden && !panel.classList.contains('hidden-panel'));
    }, id, { timeout: 12000 });
  } catch (error) {
    // Preserve the hard UI assertion: report evidence, never skip the menu.
    const state = await page.evaluate(section => ({
      section,
      current: window.EKODIAdminPanels?.current?.() || '',
      route: location.pathname + location.hash,
      panels: [...document.querySelectorAll('.content [data-panel]')]
        .filter(node => String(node.dataset.panel || '').split(/\s+/).includes(section))
        .map(node => ({
          id: node.id || '',
          hidden: node.hidden,
          hiddenClass: node.classList.contains('hidden-panel'),
          display: getComputedStyle(node).display,
          visibility: getComputedStyle(node).visibility,
          textLength: String(node.textContent || '').trim().length,
          width: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height,
        })),
    }), id);
    console.error(`[PROD-E2E] ${id}: panel visibility timeout ${JSON.stringify(state)}`);
    throw new Error(`${id}: panel visibility did not stabilize: ${JSON.stringify(state)}`, { cause: error });
  }

  await page.waitForFunction(section => {
    const panel = [...document.querySelectorAll('.content [data-panel]')].find(node => String(node.dataset.panel || '').split(/\s+/).includes(section) && !node.hidden && !node.classList.contains('hidden-panel'));
    if (!panel) return false;
    const style = getComputedStyle(panel);
    const rect = panel.getBoundingClientRect();
    const text = String(panel.innerText || panel.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length > 0 && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }, id, { timeout: 12000 });
  const visiblePanel = await page.evaluate(section => {
    const panel = [...document.querySelectorAll('.content [data-panel]')].find(node => String(node.dataset.panel || '').split(/\s+/).includes(section) && !node.hidden && !node.classList.contains('hidden-panel'));
    if (!panel) return null;
    const style = getComputedStyle(panel);
    const rect = panel.getBoundingClientRect();
    const text = String(panel.innerText || panel.textContent || '').replace(/\s+/g, ' ').trim();
    return { tag: panel.tagName, id: panel.id || '', textLength: text.length, display: style.display, visibility: style.visibility, width: rect.width, height: rect.height };
  }, id);
  if (!visiblePanel || visiblePanel.textLength < 1 || visiblePanel.display === 'none' || visiblePanel.visibility === 'hidden' || visiblePanel.width < 1 || visiblePanel.height < 1) {
    throw new Error(`${id} did not render a visible non-empty panel: ${JSON.stringify(visiblePanel)}`);
  }
  if (id === 'campus' && visiblePanel.id !== 'campusPanel') throw new Error(`Campus rendered unexpected panel: ${visiblePanel.id || '(no id)'}`);
  if (id === 'infra-costs') {
    // PROD-E2E: accepting a DOM-only panel can still screenshot a different
    // section when the Admin workspace retains a previous scroll position.
    await page.waitForFunction(() => {
      const panel=document.querySelector('#ekodiInfraCosts');
      return panel && !panel.hidden && !panel.classList.contains('hidden-panel')
        && panel.querySelectorAll('[data-infra-invoices] tr').length===2;
    }, null, {timeout:15000});
    const geometry=await page.evaluate(() => {
      const panel=document.querySelector('#ekodiInfraCosts');
      const main=document.querySelector('.app>main');
      const rect=panel.getBoundingClientRect();
      const mainRect=main.getBoundingClientRect();
      const x=Math.min(innerWidth-10,Math.round(rect.left+Math.min(280,rect.width/2)));
      const y=Math.min(innerHeight-10,Math.round(rect.top+35));
      const hit=document.elementFromPoint(x,Math.max(10,y));
      return {
        panelTop:Math.round(rect.top),panelWidth:Math.round(rect.width),
        mainWidth:Math.round(mainRect.width),viewportWidth:innerWidth,
        mainScroll:Math.round(main.scrollTop),
        hitInPanel:Boolean(hit&&panel.contains(hit)),hitTag:hit?.tagName||'',
        heading:panel.querySelector('h2')?.textContent?.trim()||'',
      };
    });
    if(geometry.heading!=='비용·인프라 관리'||geometry.panelTop < -5||geometry.panelTop>200||
       geometry.mainScroll>30||geometry.panelWidth<geometry.mainWidth*.75||!geometry.hitInPanel)
      throw new Error('INFRA_COST_VISIBLE_VIEWPORT_E2E failed: '+JSON.stringify(geometry));
    console.log('[PROD-E2E] infra-costs desktop viewport and heading verified: '+JSON.stringify(geometry));
    await page.screenshot({path:path.join(artifactsDir,'infra-costs-desktop-verified.png'),fullPage:false});

    const search=page.locator('#ekodiInfraCosts [data-infra-invoice-search]');
    const status=page.locator('#ekodiInfraCosts [data-infra-invoice-filter]');
    const count=page.locator('#ekodiInfraCosts [data-infra-filter-count]');
    await search.fill('TEST-CF-001');
    if((await count.textContent())?.trim()!=='1 / 2건 표시')throw new Error('INFRA_COST_SEARCH_E2E failed');
    await status.selectOption('paid');
    if((await count.textContent())?.trim()!=='0 / 2건 표시')throw new Error('INFRA_COST_FILTER_E2E failed');
    await page.locator('#ekodiInfraCosts [data-infra-filter-reset]').click();
    if((await count.textContent())?.trim()!=='2 / 2건 표시')throw new Error('INFRA_COST_FILTER_RESET_E2E failed');
    await page.locator('#ekodiInfraCosts [data-infra-open-invoice]').click();
    if(!(await page.locator('#ekodiInfraCosts [data-infra-invoice-editor]').evaluate(node=>node.open)))
      throw new Error('INFRA_COST_INVOICE_EDITOR_E2E failed');

    await page.setViewportSize({width:390,height:844});
    try {
      const mobile=await page.evaluate(()=>{
        const p=document.querySelector('#ekodiInfraCosts');
        const summary=p.querySelector('.infra-summary');
        const providers=p.querySelector('.infra-providers');
        const table=p.querySelector('.infra-table-wrap');
        const colCount=node=>getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length;
        return {
          panelWidth:Math.round(p.getBoundingClientRect().width),
          viewport:innerWidth,documentExcess:document.documentElement.scrollWidth-innerWidth,
          summaryColumns:colCount(summary),providerColumns:colCount(providers),
          invoiceTableScrollable:table.scrollWidth>table.clientWidth,
        };
      });
      if(mobile.summaryColumns!==1||mobile.providerColumns!==1||
         mobile.panelWidth>mobile.viewport+2||mobile.documentExcess>2||!mobile.invoiceTableScrollable)
        throw new Error('INFRA_COST_MOBILE_LAYOUT_E2E failed: '+JSON.stringify(mobile));
      await page.locator('#ekodiInfraCosts').scrollIntoViewIfNeeded();
      console.log('[PROD-E2E] infra-costs mobile responsive viewport verified: '+JSON.stringify(mobile));
      await page.screenshot({path:path.join(artifactsDir,'infra-costs-mobile-verified.png'),fullPage:false});
    } finally {
      await page.setViewportSize({width:1440,height:1000});
      await page.evaluate(()=>{const main=document.querySelector('.app>main');if(main)main.scrollTop=0});
    }
  }

  if (id === 'engine-all') {
    // ENGINE_CATALOG_STYLE_E2E: a non-empty DOM is not enough; CSS must load
    // on nested admin URLs, and compact cards must remain readable on mobile.
    const expectedStylePath = '/common-services-admin.css';
    await page.waitForFunction(expected => {
      const style = document.querySelector('link[data-ekodi-common-services-style]');
      return style && new URL(style.href).pathname === expected
        && Boolean(style.sheet)
        && getComputedStyle(document.querySelector('.common-services-summary')).display === 'grid'
        && getComputedStyle(document.querySelector('.common-service-card')).display === 'grid';
    }, expectedStylePath, { timeout: 15000 });
    const desktop = await page.evaluate(() => ({
      link: new URL(document.querySelector('link[data-ekodi-common-services-style]').href).pathname,
      summary: getComputedStyle(document.querySelector('.common-services-summary')).display,
      list: getComputedStyle(document.querySelector('.common-services-list-head')).display,
      detailHidden: document.querySelector('#commonServiceDetail')?.hidden === true,
      summaryCount: document.querySelectorAll('.common-services-summary article').length,
    }));
    if (desktop.link !== expectedStylePath || desktop.summary !== 'grid' || desktop.list !== 'grid' || !desktop.detailHidden || desktop.summaryCount !== 3) {
      throw new Error('ENGINE_CATALOG_STYLE_E2E desktop failed: ' + JSON.stringify(desktop));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    try {
      // A desktop-to-mobile resize can leave the navigation drawer covering the
      // content. Dismiss it through the real public scrim before taking evidence.
      const drawerScrim = page.locator('[data-admin-drawer-scrim]');
      if (await drawerScrim.isVisible()) await drawerScrim.click();
      await page.waitForFunction(() => {
        const drawer = document.querySelector('.sidebar');
        const scrim = document.querySelector('[data-admin-drawer-scrim]');
        const style = drawer && getComputedStyle(drawer);
        const drawerRect = drawer?.getBoundingClientRect();
        return !document.body.classList.contains('admin-mobile-drawer-open')
          && !drawer?.classList.contains('open')
          && (!scrim || scrim.hidden)
          && (style?.visibility === 'hidden' || (drawerRect && drawerRect.right <= 2));
      }, null, { timeout: 5000 });
      const mobile = await page.evaluate(() => {
        const list = document.querySelector('.common-services-list-wrap');
        const card = document.querySelector('.common-service-card');
        return {
          cardDisplay: card ? getComputedStyle(card).display : '',
          headerDisplay: getComputedStyle(document.querySelector('.common-services-list-head')).display,
          summaryDisplay: getComputedStyle(document.querySelector('.common-services-summary')).display,
          scrollExcess: list ? Math.round(list.scrollWidth - list.clientWidth) : -1,
          cardLeft: card ? Math.round(card.getBoundingClientRect().left) : -1,
          cardRight: card ? Math.round(card.getBoundingClientRect().right) : -1,
          viewportWidth: window.innerWidth,
          sidebarOpen: Boolean(document.querySelector('.sidebar')?.classList.contains('open')),
          drawerVisibility: getComputedStyle(document.querySelector('.sidebar')).visibility,
          cardUnobscured: (() => {
            if (!card) return false;
            const rect = card.getBoundingClientRect();
            const x = Math.round((rect.left + rect.right) / 2);
            const y = Math.round((rect.top + rect.bottom) / 2);
            const top = document.elementFromPoint(x,y);
            return Boolean(top && (top===card || card.contains(top)));
          })(),
          srOnlyHidden: (() => {const note=card?.querySelector('.sr-only');const style=note&&getComputedStyle(note);return Boolean(note&&style?.position==='absolute'&&note.getBoundingClientRect().width<=1)})(),
        };
      });
      if (mobile.cardDisplay !== 'grid' || mobile.headerDisplay !== 'none' || mobile.summaryDisplay !== 'grid'
          || mobile.scrollExcess > 2 || mobile.sidebarOpen || mobile.cardLeft < -2
          || mobile.cardRight > mobile.viewportWidth + 2 || !mobile.srOnlyHidden
          || mobile.drawerVisibility !== 'hidden' || !mobile.cardUnobscured) {
        throw new Error('ENGINE_CATALOG_STYLE_E2E mobile failed: ' + JSON.stringify(mobile));
      }
      console.log('[PROD-E2E] engine-all: stylesheet and compact desktop/mobile layout verified');
      await page.screenshot({ path:path.join(artifactsDir,'menu-engine-all-mobile.png'),fullPage:false });
    } finally {
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  }
  // ADMIN-PANEL-VISIBILITY-20261028: a selected menu is not genuinely visible
  // when the architecture panel is wrongly rendered above it by !important CSS.
  if (id !== 'architecture') {
    const architectureLeak = await page.evaluate(() => {
      const panel = document.querySelector('.content > .architecture[data-panel~="architecture"]');
      if (!panel) return null;
      const style = getComputedStyle(panel);
      const rect = panel.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && rect.width > 0 && rect.height > 0
        ? { display:style.display, width:rect.width, height:rect.height, hidden:panel.hidden,
            hiddenClass:panel.classList.contains('hidden-panel') } : null;
    });
    if (architectureLeak) throw new Error(`${id}: hidden architecture panel overpaints active workspace: ${JSON.stringify(architectureLeak)}`);
  }

  // ADMIN-ARCH-GRID-LIVE-E2E-20261028: verify actual computed columns on the
  // authenticated *production* Admin, not only the presence of CSS declarations.
  // Read-only checks and screenshots; do not mutate any customer or platform data.
  if (id === 'architecture') {
    const widths = [[1440,3],[1366,3],[768,2],[390,1],[320,1]];
    const proof = [];
    try {
      await page.waitForFunction(() => {
        const panel=document.querySelector('.content > .architecture[data-panel~="architecture"]');
        return panel && !panel.hidden && !panel.classList.contains('hidden-panel')
          && getComputedStyle(panel).display!=='none'
          && panel.querySelectorAll('#structureLayers > article').length>=9;
      }, null, {timeout:15000});
      for (const [width, expectedColumns] of widths) {
        await page.setViewportSize({width,height:width<=390?844:1000});
        const metrics = await page.evaluate(() => {
          const panel=document.querySelector('.content > .architecture[data-panel~="architecture"]');
          const layers=panel?.querySelector('#structureLayers');
          const serviceGrid=panel?.querySelector('#structureServiceRegistry .structure-service-grid');
          const platformGrid=panel?.querySelector('#ekodiArchitectureMap .system-map-platform-grid');
          const flow=panel?.querySelector('#structureFlow');
          const cols=node => node ? getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length : 0;
          const arrows=flow?[...flow.children].filter(el=>el.tagName==='B'):[],arrowWidths=arrows.map(el=>Math.round(el.getBoundingClientRect().width));
          return {
            viewport:innerWidth, panelVisible:Boolean(panel&&!panel.hidden&&!panel.classList.contains('hidden-panel')&&getComputedStyle(panel).display!=='none'),
            layers:cols(layers), services:serviceGrid?cols(serviceGrid):null,
            platform:platformGrid?cols(platformGrid):null,
            layerCards:layers?.querySelectorAll(':scope > article').length||0,
            flowCards:flow?.querySelectorAll(':scope > div').length||0,
            arrows:arrowWidths, arrowVisible:arrows.filter(el=>getComputedStyle(el).display!=='none').length,
            documentOverflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),
            layerOverflow:layers?Math.max(0,layers.scrollWidth-layers.clientWidth):0,
            panelWidth:Math.round(panel?.getBoundingClientRect().width||0),
          };
        });
        if(!metrics.panelVisible||metrics.layers!==expectedColumns||
           (metrics.services!==null&&metrics.services!==expectedColumns)||
           (metrics.platform!==null&&metrics.platform!==expectedColumns)||
           metrics.layerCards<9||metrics.flowCards!==4||
           metrics.documentOverflow>2||metrics.layerOverflow>2||
           (width>=1366&&(metrics.arrowVisible!==3||metrics.arrows.some(w=>w>30)))||
           (width<=390&&metrics.arrowVisible!==0)) {
          throw new Error('ADMIN_ARCHITECTURE_GRID_LIVE_E2E failed: '+JSON.stringify({expectedColumns,...metrics}));
        }
        proof.push({width,columns:metrics.layers,documentOverflow:metrics.documentOverflow});
        if (width===768||width===390) {
          await page.locator('#structureLayers').evaluate(node=>node.scrollIntoView({block:'start'}));
          await page.screenshot({path:path.join(artifactsDir,`menu-architecture-${width}.png`),fullPage:false});
        }
      }
      console.log('[PROD-E2E] architecture: authenticated production columns + arrows + overflow verified '+JSON.stringify(proof));
    } finally {
      await page.setViewportSize({width:1440,height:1000});
      await page.evaluate(()=>{const main=document.querySelector('.app>main');if(main)main.scrollTop=0;});
    }
  }

  if (id === 'social') {
    // Read-only runtime interactions on the actually deployed Social Hub.
    // Never connect accounts, change settings, or invoke publish mutations.
    const tabKeys = ['sites','connections','publishing','policy'];
    const tabs = page.locator('#socialAdmin .social-workspace-tabs [role="tab"]');
    if (await tabs.count() !== tabKeys.length) throw new Error('social: expected exactly four operational tabs');
    try {
      await page.waitForFunction(() =>
        document.querySelectorAll('#socialAdmin [data-site-channel-admin]').length > 0,
        null, { timeout:12000 });
    } catch (error) {
      // Read-only evidence for the repeated production timeout. Never log tokens or page HTML.
      const diagnosis = await page.evaluate(async () => {
        const status = document.querySelector('#socialAdmin .social-site-directory .social-admin-status');
        let catalog = {};
        try {
          const response = await fetch('/admin-service-catalog.js', { cache:'no-store', credentials:'same-origin' });
          catalog = {
            httpStatus: response.status,
            contentType: response.headers.get('content-type') || '',
            pathname: new URL(response.url).pathname,
          };
        } catch (requestError) {
          catalog = { error: String(requestError?.message || requestError).slice(0,180) };
        }
        return {
          directoryState: status?.dataset.state || 'missing',
          directoryMessage: (status?.textContent || '').slice(0,280),
          renderedCards: document.querySelectorAll('#socialAdmin [data-site-channel-admin]').length,
          catalog,
        };
      });
      throw new Error('social: directory did not render: ' + JSON.stringify(diagnosis), { cause:error });
    }
    for (const tab of tabKeys) {
      await page.locator(`#social-tab-${tab}`).click();
      const tabState = await page.evaluate(key => {
        const current = document.querySelector(`#social-tab-${key}`);
        const panel = document.querySelector(`#social-view-${key}`);
        const tabs = [...document.querySelectorAll('#socialAdmin .social-workspace-tabs [role="tab"]')];
        const panels = [...document.querySelectorAll('#socialAdmin [role="tabpanel"]')];
        return {
          selected:current?.getAttribute('aria-selected'),
          hidden:panel?.hidden,
          rendered:panel ? getComputedStyle(panel).display !== 'none' : false,
          selectedCount:tabs.filter(node=>node.getAttribute('aria-selected')==='true').length,
          renderedCount:panels.filter(node=>getComputedStyle(node).display !== 'none').length,
        };
      }, tab);
      if (tabState.selected !== 'true' || tabState.hidden || !tabState.rendered
        || tabState.selectedCount !== 1 || tabState.renderedCount !== 1) {
        throw new Error(`social: ${tab} tab did not exclusively render its panel: ${JSON.stringify(tabState)}`);
      }
    }
    await page.locator('#social-tab-sites').click();
    const cards = page.locator('#socialAdmin [data-site-channel-admin]');
    const siteCount = await cards.count();
    const search = page.locator('#socialAdmin .social-directory-toolbar input[type="search"]');
    await search.fill('__EKODI_UNMATCHABLE_SEARCH_PROBE__');
    const hiddenCount = await cards.evaluateAll(nodes=>nodes.filter(node=>node.hidden).length);
    if (hiddenCount !== siteCount) throw new Error(`social: site search did not hide unmatched entries (${hiddenCount}/${siteCount})`);
    await search.fill('');
    const restoredCount = await cards.evaluateAll(nodes=>nodes.filter(node=>!node.hidden).length);
    if (restoredCount !== siteCount) throw new Error(`social: clearing search did not restore site cards (${restoredCount}/${siteCount})`);

    await page.setViewportSize({width:390,height:844});
    // The E2E navigates many desktop menus before resizing. Closing the
    // mobile drawer through the real keyboard handler is essential: a DOM-only
    // pass with the menu overlay still covering the content is not visual proof.
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
      const sidebar=document.querySelector('.sidebar');
      const rect=sidebar?.getBoundingClientRect();
      return sidebar && !sidebar.classList.contains('open')
        && !document.body.classList.contains('admin-mobile-drawer-open')
        && rect && rect.right <= 2;
    }, null, {timeout:5000});
    const mobile = await page.evaluate(() => {
      const host = document.querySelector('#socialAdmin');
      const tabs = document.querySelector('#socialAdmin .social-workspace-tabs');
      const rect = host?.getBoundingClientRect();
      return {
        hostLeft:rect?.left, hostRight:rect?.right, viewport:innerWidth,
        tabsHeight:tabs?.getBoundingClientRect().height,
        tabsScrollWidth:tabs?.scrollWidth,
        tabsClientWidth:tabs?.clientWidth,
        selected:document.querySelector('#social-tab-sites')?.getAttribute('aria-selected'),
        sidebarClosed:!document.querySelector('.sidebar')?.classList.contains('open')
          && !document.body.classList.contains('admin-mobile-drawer-open'),
        sidebarRight:document.querySelector('.sidebar')?.getBoundingClientRect().right,
        headingVisible:(()=>{
          const heading=document.querySelector('#socialAdmin .social-admin-head h2');
          if(!heading)return false;
          const box=heading.getBoundingClientRect();
          const point=document.elementFromPoint(Math.min(innerWidth-4,Math.max(4,box.left+12)),Math.min(innerHeight-4,Math.max(4,box.top+12)));
          return box.width>0 && box.height>0 && box.left>=0 && box.top>=0
            && box.left<innerWidth && box.top<innerHeight
            && Boolean(point && (point===heading || heading.contains(point)));
        })(),
      };
    });
    if (mobile.hostLeft < -2 || mobile.hostRight > mobile.viewport+2 ||
        mobile.tabsHeight < 40 || mobile.selected !== 'true' ||
        !mobile.sidebarClosed || mobile.sidebarRight>2 || !mobile.headingVisible) {
      throw new Error('social: mobile drawer overlays workspace, heading inaccessible or tabs clipped at 390px: '+JSON.stringify(mobile));
    }
    await page.screenshot({path:path.join(artifactsDir,'menu-social-mobile.png'),fullPage:false});
    await page.setViewportSize({width:1440,height:1000});
    console.log(`[PROD-E2E] social: four tabs, ${siteCount} site cards, search reset, mobile 390px and architecture isolation verified`);
  }
  results.push({ id, group, kind: 'panel', ok: true, detail: `${visiblePanel.id || visiblePanel.tag}:${visiblePanel.textLength}` });
  console.log(`[PROD-E2E] ${id}: ok ${visiblePanel.id || visiblePanel.tag}:${visiblePanel.textLength}`);
  await page.screenshot({ path:path.join(artifactsDir,`menu-${id}.png`), fullPage:false });

  // Keep menu verification on one authenticated shell. Full-page reloads are
  // reserved for actual shell degradation so synthetic E2E cannot self-trigger
  // Cloudflare 429 throttling or turn an optional service outage into shell failure.
  const recoveredShell = await resetAdminShellIfPoisoned();
  if (recoveredShell) selectedWorkArea = null;
}

const activeCount = results.filter(result => result.ok).length;
const expectedCount = menus.length + 1;
console.log(`ADMIN_PRODUCTION_UI_E2E=${activeCount}/${expectedCount}`);
console.log(`ADMIN_WORK_AREAS=${workAreas.join(',')}`);
console.log(`ADMIN_FINGERPRINT=${assetVersion}`);
for (const result of results) console.log(`PASS ${result.id} ${result.group} ${result.kind} ${result.detail}`);

if (retiredApiRequests.length) {
  throw new Error(`Retired API browser requests detected: ${[...new Set(retiredApiRequests)].join(' | ')}`);
}
const retiredApiConsole = consoleErrors.filter(message => message.includes(retiredApiHost));
if (retiredApiConsole.length) {
  throw new Error(`Retired API console references detected: ${[...new Set(retiredApiConsole)].join(' | ')}`);
}

const fatalErrors = pageErrors.filter(message => !/ResizeObserver loop/i.test(message));
if (fatalErrors.length) {
  console.log(`Observed page errors (${fatalErrors.length}):`);
  for (const error of fatalErrors) console.log(`PAGEERROR ${error}`);
  throw new Error('Production Admin emitted page errors during menu E2E');
}
if (activeCount !== expectedCount) throw new Error(`Expected ${expectedCount} verified Admin interactions including command-home, received ${activeCount}`);
await page.screenshot({ path:path.join(artifactsDir,'admin-final.png'), fullPage:false });

await browser.close();
