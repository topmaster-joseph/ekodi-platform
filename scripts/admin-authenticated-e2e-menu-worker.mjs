import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { adminMenuOrder, getAdminMenuGroupForSection, getAdminMenuItem } from '../admin-menu-registry.js';
import { AI_ROUTER_SCORE_POLICY } from '../ai-router-score.js';

const token = String(process.env.E2E_ADMIN_TOKEN || '').trim();
const menuId = String(process.env.E2E_MENU_ID || '').trim();
if (!token) throw new Error('E2E_ADMIN_TOKEN is required');
if (!menuId) throw new Error('E2E_MENU_ID is required');

const menuIds = adminMenuOrder();
if (!menuIds.includes(menuId)) throw new Error(`Unknown Admin menu: ${menuId}`);
const group = getAdminMenuGroupForSection(menuId);
const baseUrl = 'https://admin.ekodi.kr/';
const authenticatedEntryUrl = `${baseUrl}?route=finance#ekodi_admin_token=${token}`;
const artifactsDir = path.resolve('artifacts/admin-authenticated-e2e');
const reportPath = path.join(artifactsDir, `menu-${menuId.replace(/[^a-z0-9_-]/gi, '_')}.json`);
await fs.mkdir(artifactsDir, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const failedAdminAssets = [];
const results = [];
let browser;
let page;
let fatal = null;
let currentStage = 'bootstrap';
const stage = value => { currentStage = value; console.log(`[E2E:${menuId}] stage=${value}`); };

async function clickFast(locator) {
  await locator.waitFor({ state: 'visible', timeout: 5_000 });
  await locator.click({ force: true, noWaitAfter: true, timeout: 5_000 });
}

async function waitForReady() {
  stage('ready-token');
  await page.waitForFunction(() => sessionStorage.getItem('ekodi-auth-token'), null, { timeout: 15_000 });
  stage('ready-app');
  await page.waitForSelector('#app:not([hidden])', { timeout: 15_000 });
  stage('ready-runtime');
  await page.waitForFunction(() => window.EKODIAdminPanels && window.EKODIAdminSidebar, null, { timeout: 15_000 });
  stage('ready-session');
  await page.waitForFunction(() => document.querySelector('#apiState')?.textContent?.includes('정상'), null, { timeout: 15_000 });
}

async function waitForAdminNavigationIdle() {
  stage('pre-handoff-idle');
  let previous = '';
  let stableSamples = 0;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await page.waitForLoadState('domcontentloaded', { timeout: 3_000 }).catch(() => {});
    const current = page.url();
    const hostname = new URL(current).hostname;
    if (!['admin.ekodi.kr', 'ekodi.kr'].includes(hostname)) throw new Error(`Admin navigation left the canonical surface before Tax handoff: ${current}`);
    stableSamples = current === previous ? stableSamples + 1 : 0;
    previous = current;
    if (stableSamples >= 2) return current;
    await page.waitForTimeout(250);
  }
  throw new Error(`Admin navigation did not settle before Tax handoff: ${page.url()}`);
}

async function selectWorkArea() {
  stage('global');
  const global = page.locator(`button.admin-global-nav[data-admin-global-group="${group}"]`);
  await global.waitFor({ state: 'visible', timeout: 5_000 });
  const aria = await global.getAttribute('aria-current');
  const classes = String(await global.getAttribute('class') || '');
  if (aria !== 'page' && !classes.split(/\s+/).includes('active')) await clickFast(global);
  await page.waitForFunction(target => [...document.querySelectorAll('button[data-admin-global-group]')].some(node => node.dataset.adminGlobalGroup === target && (node.getAttribute('aria-current') === 'page' || node.classList.contains('active'))), group, { timeout: 5_000 });
}

async function visiblePanelState() {
  return page.evaluate(section => {
    const panel = [...document.querySelectorAll('[data-panel]')].find(node => {
      const ids = String(node.dataset.panel || '').split(/\s+/).filter(Boolean);
      const style = getComputedStyle(node);
      return ids.includes(section) && !node.hidden && !node.classList.contains('hidden-panel') && style.display !== 'none' && style.visibility !== 'hidden';
    });
    const tab = document.querySelector(`button.admin-context-tab[data-admin-context-section="${section}"]`);
    const text = String(panel?.innerText || '').replace(/\s+/g, ' ').trim();
    const busy = panel ? [panel, ...panel.querySelectorAll('[aria-busy="true"],.loading,.spinner')].filter(node => {
      if (!node.matches('[aria-busy="true"],.loading,.spinner')) return false;
      const style = getComputedStyle(node);
      return node.getAttribute('aria-hidden') !== 'true' && !node.hidden && style.display !== 'none' && style.visibility !== 'hidden';
    }).length : 0;
    return {
      panelFound: Boolean(panel), textLength: text.length, busy,
      selected: tab?.getAttribute('aria-selected') === 'true' || tab?.classList.contains('active') || false,
      pageTitle: document.querySelector('#pageTitle')?.textContent?.trim() || '',
      currentSection: window.EKODIAdminPanels?.current?.() || '', hash: location.hash,
    };
  }, menuId);
}

async function waitForSettledPanel(timeout = 8_000) {
  await page.waitForFunction(section => {
    const panel = [...document.querySelectorAll('[data-panel]')].find(node => {
      const ids = String(node.dataset.panel || '').split(/\s+/).filter(Boolean);
      const style = getComputedStyle(node);
      return ids.includes(section) && !node.hidden && !node.classList.contains('hidden-panel') && style.display !== 'none' && style.visibility !== 'hidden';
    });
    if (!panel) return false;
    const text = String(panel.innerText || '').replace(/\s+/g, ' ').trim();
    const busy = [panel, ...panel.querySelectorAll('[aria-busy="true"],.loading,.spinner')].some(node => {
      if (!node.matches('[aria-busy="true"],.loading,.spinner')) return false;
      const style = getComputedStyle(node);
      return node.getAttribute('aria-hidden') !== 'true' && !node.hidden && style.display !== 'none' && style.visibility !== 'hidden';
    });
    return text.length >= 4 && !busy;
  }, menuId, { timeout });
}

function externalStorageNavigation() {
  return page.waitForRequest(request => {
    try {
      const url = new URL(request.url());
      return request.isNavigationRequest() && request.frame() === page.mainFrame() && url.hostname !== 'admin.ekodi.kr';
    } catch { return false; }
  }, { timeout: 10_000 }).then(request => request.url()).catch(() => null);
}

async function verifyStorage(tab, alreadyActive, started) {
  const navigation = externalStorageNavigation();
  if (!alreadyActive) await clickFast(tab);
  stage('storage-outcome');
  const panel = page.waitForFunction(section => {
    const node = [...document.querySelectorAll('[data-panel]')].find(el => String(el.dataset.panel || '').split(/\s+/).includes(section));
    if (!node || node.hidden || node.classList.contains('hidden-panel')) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const text = String(node.innerText || '').replace(/\s+/g, ' ').trim();
    const busy = [...node.querySelectorAll('[aria-busy="true"],.loading,.spinner')].some(el => {
      const s = getComputedStyle(el); return el.getAttribute('aria-hidden') !== 'true' && !el.hidden && s.display !== 'none' && s.visibility !== 'hidden';
    });
    return text.length >= 4 && !busy;
  }, menuId, { timeout: 8_000 }).then(() => ({ kind: 'panel' })).catch(error => ({ kind: 'panel-error', error }));
  const first = await Promise.race([panel, navigation.then(url => url ? { kind: 'handoff', url } : { kind: 'handoff-timeout' })]);
  if (first.kind === 'handoff') {
    const destination = new URL(first.url);
    if (destination.hostname !== 'accounts.google.com') throw new Error(`storage: unexpected external handoff ${destination.hostname}`);
    results.push({ id: menuId, group, ok: true, durationMs: Date.now() - started, reauthHandoff: true, destinationHost: destination.hostname });
    return;
  }
  if (first.kind === 'panel-error') throw first.error;
  const state = await visiblePanelState();
  if (!state.panelFound || !state.selected || state.textLength < 4 || state.busy) throw new Error(`storage panel invalid: ${JSON.stringify(state)}`);
  results.push({ id: menuId, group, ok: true, durationMs: Date.now() - started, ...state });
}

async function verifyTax(tab, alreadyActive, started) {
  stage('tax-handoff');
  const writeVerification = process.env.E2E_TAX_WRITE_VERIFY === '1';
  const navigation = page.waitForRequest(request => {
    try {
      const destination = new URL(request.url());
      return request.isNavigationRequest() && request.frame() === page.mainFrame() && destination.hostname === 'tax.ekodi.kr';
    } catch { return false; }
  }, { timeout: 10_000 });
  await clickFast(tab);
  const request = await navigation;
  const destination = new URL(request.url());
  if (destination.hostname !== 'tax.ekodi.kr') throw new Error(`tax: wrong handoff destination ${destination.hostname}`);
  try {
    await page.waitForURL(url => url.hostname === 'tax.ekodi.kr', { waitUntil:'commit', timeout:15_000 });
  } catch (error) {
    if (new URL(page.url()).hostname !== 'tax.ekodi.kr') throw error;
  }
  stage('tax-session-handoff');
  await page.waitForFunction(() => Boolean(sessionStorage.getItem('ekodi-auth-token')) && location.hash === '', null, { timeout:15_000 });
  await page.waitForFunction(() => document.querySelector('#notice')?.classList.contains('good'), null, { timeout:15_000 });

  async function readProfile(profileId) {
    return page.evaluate(async id => {
      const auth = sessionStorage.getItem('ekodi-auth-token') || '';
      const response = await fetch('/api/finance/tax-profiles?organizationId=EKODIBIZ', {
        headers:{ accept:'application/json', authorization:`Bearer ${auth}` }, cache:'no-store'
      });
      const payload = await response.json().catch(() => ({}));
      const profile = Array.isArray(payload.profiles) ? payload.profiles.find(item => Number(item.id) === Number(id)) : null;
      return { status:response.status, profile };
    }, profileId);
  }
  if (writeVerification) {
    const suppliersTab = page.locator('button[data-tab="suppliers"]');
    await clickFast(suppliersTab);
    await page.waitForFunction(() => {
      const view = document.querySelector('[data-view="suppliers"]');
      return Boolean(view && !view.classList.contains('hidden'));
    }, null, { timeout:5_000 });
  }
  const edit = page.locator('button[data-edit-supplier]').first();
  await edit.waitFor({ state:writeVerification ? 'visible' : 'attached', timeout:10_000 });
  const profileId = Number(await edit.getAttribute('data-edit-supplier'));
  if (!Number.isInteger(profileId) || profileId <= 0) throw new Error('tax: invalid supplier profile id');
  const before = await readProfile(profileId);
  if (before.status !== 200 || !before.profile) throw new Error(`tax: authenticated supplier read failed HTTP ${before.status}`);

  if (!writeVerification) {
    results.push({
      id:menuId, group, ok:true, durationMs:Date.now()-started,
      destination:'https://tax.ekodi.kr/', tokenHandoffVerified:true,
      authenticatedReadStatus:before.status, supplierProfileId:profileId,
      supplierSaveVerification:'not-requested'
    });
    return;
  }

  stage('tax-supplier-edit');
  await clickFast(edit);
  const modal = page.locator('#modal');
  await modal.waitFor({ state:'visible', timeout:8_000 });
  const modalTitle = String(await page.locator('#modalTitle').textContent() || '').trim();
  if (modalTitle !== '공급자 수정') throw new Error(`tax: supplier edit modal mismatch: ${modalTitle}`);
  const save = page.locator('#supplierSave');
  await save.waitFor({ state:'visible', timeout:5_000 });
  const writeResponse = page.waitForResponse(response => {
    try {
      const url = new URL(response.url());
      return response.request().method() === 'PUT' && url.pathname === `/api/finance/tax-profiles/${profileId}`;
    } catch { return false; }
  }, { timeout:12_000 });
  await save.click({ noWaitAfter:true, timeout:5_000 });
  const response = await writeResponse;
  if (response.status() !== 200) {
    const payload = await response.text().catch(() => '');
    throw new Error(`tax: supplier UI save returned HTTP ${response.status()} ${payload.slice(0,180)}`);
  }
  await modal.waitFor({ state:'hidden', timeout:10_000 });
  await page.waitForFunction(() => document.querySelector('#notice')?.classList.contains('good'), null, { timeout:10_000 });

  stage('tax-supplier-readback');
  const after = await readProfile(profileId);
  if (after.status !== 200 || !after.profile) throw new Error(`tax: supplier readback failed HTTP ${after.status}`);
  const fields = ['profileName','corpNum','taxRegId','corpName','ceoName','addr','bizType','bizClass','contactName','tel','email','isDefault','active'];
  const changed = fields.filter(key => JSON.stringify(before.profile[key] ?? null) !== JSON.stringify(after.profile[key] ?? null));
  if (changed.length) throw new Error(`tax: value-preserving save changed fields: ${changed.join(',')}`);

  results.push({
    id:menuId, group, ok:true, durationMs:Date.now()-started,
    destination:'https://tax.ekodi.kr/', tokenHandoffVerified:true,
    authenticatedReadStatus:before.status, supplierProfileId:profileId,
    supplierSaveVerification:'passed', writeStatus:response.status(),
    persistenceReadbackStatus:after.status, persistenceVerified:true,
    comparedFieldCount:fields.length
  });
}

async function verifyPublicSiteControls(tab, alreadyActive, started) {
  stage('public-site-controls-ready');
  if (!alreadyActive) await clickFast(tab);
  await page.waitForFunction(() => typeof window.EKODIPublicSiteControls?.load === 'function', null, { timeout: 10_000 });

  stage('public-site-controls-api');
  const response = await fetch('https://api.ekodi.kr/api/control/public-sites', {
    headers: { accept: 'application/json', authorization: `Bearer ${token}`, origin: 'https://admin.ekodi.kr' },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== 200) throw new Error(`public-site-controls: API returned HTTP ${response.status}`);
  const corsOrigin = response.headers.get('access-control-allow-origin') || '';
  if (corsOrigin !== 'https://admin.ekodi.kr') throw new Error(`public-site-controls: production CORS origin mismatch: ${corsOrigin || 'missing'}`);
  const payload = await response.json().catch(() => ({}));
  if (!Array.isArray(payload.sites)) throw new Error('public-site-controls: API payload missing sites array');

  stage('public-site-controls-render');
  await page.evaluate(() => window.EKODIPublicSiteControls.load());
  const form = page.locator('form[data-public-site-id="cgma"]');
  await form.waitFor({ state: 'visible', timeout: 8_000 });
  const state = await visiblePanelState();
  const domainText = String(await form.locator('.muted').first().textContent() || '');
  const publicStatus = await form.locator('select[name="publicStatus"]').inputValue();
  const maintenanceDisplayType = await form.locator('select[name="maintenanceDisplayType"]').inputValue();
  const redirectMode = await form.locator('select[name="redirectMode"]').inputValue();
  const badge = String(await form.locator('[data-public-site-status-badge]').textContent() || '').trim();
  const message = String(await page.locator('#publicSiteControlsPanel [data-public-site-message]').textContent() || '').replace(/\s+/g, ' ').trim();
  if (!state.panelFound || !state.selected || state.busy) throw new Error(`public-site-controls panel invalid: ${JSON.stringify(state)}`);
  if (!domainText.includes('cgma.or.kr')) throw new Error(`public-site-controls: CGMA domain missing: ${domainText}`);
  if (!['public', 'maintenance'].includes(publicStatus)) throw new Error(`public-site-controls: invalid publicStatus ${publicStatus}`);
  if (!['default', 'url'].includes(maintenanceDisplayType)) throw new Error(`public-site-controls: invalid maintenanceDisplayType ${maintenanceDisplayType}`);
  if (!['button', 'auto'].includes(redirectMode)) throw new Error(`public-site-controls: invalid redirectMode ${redirectMode}`);
  if (!badge) throw new Error('public-site-controls: empty status badge');
  if (!message.includes('상태를 확인했습니다')) throw new Error(`public-site-controls: load confirmation missing: ${message}`);
  results.push({ id: menuId, group, ok: true, durationMs: Date.now() - started, ...state, apiStatus: response.status, corsOrigin, domain: 'cgma.or.kr', publicStatus, maintenanceDisplayType, redirectMode, badge });
}

async function verifyAiSettings(tab, alreadyActive, started) {
  stage('ai-settings-ready');
  if (!alreadyActive) await clickFast(tab);
  await page.waitForFunction(() => typeof window.EKODIAIManagement?.load === 'function', null, { timeout: 10_000 });
  stage('ai-settings-api');
  const response = await fetch('https://api.ekodi.kr/api/control/ai/v8/collaboration-settings', {
    headers: { accept:'application/json', authorization:`Bearer ${token}`, origin:'https://admin.ekodi.kr' },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== 200) throw new Error(`ai-settings: API returned HTTP ${response.status}`);
  const corsOrigin = response.headers.get('access-control-allow-origin') || '';
  if (corsOrigin !== 'https://admin.ekodi.kr') throw new Error(`ai-settings: production CORS origin mismatch: ${corsOrigin || 'missing'}`);
  const payload = await response.json().catch(() => ({}));
  const policy = payload.policy || {};
  const weights = policy.router?.weights || {};
  const weightSum = Object.values(weights).reduce((sum,value) => sum + Number(value || 0), 0);
  if (payload.ok !== true) throw new Error('ai-settings: API payload not ok');
  if (policy.collaborationByDefault !== true) throw new Error('ai-settings: collaborationByDefault unlocked');
  if (policy.execution?.cloudFirst !== true || JSON.stringify(policy.execution?.order) !== JSON.stringify(['cloud','remote','local'])) throw new Error('ai-settings: Cloud First contract drift');
  if (policy.governance?.requireHumanApprovalForDestructiveAction !== true) throw new Error('ai-settings: destructive human gate drift');
  if (policy.openai?.secretStorage !== 'server_secret_only') throw new Error('ai-settings: secret storage contract drift');
  if (policy.resources?.strategy !== 'personal-first') throw new Error('ai-settings: personal-first strategy drift');
  if (Math.abs(weightSum - 1) > 0.00001) throw new Error(`ai-settings: Router Score weights sum to ${weightSum}`);
  if (payload.routerScore?.algorithmVersion !== AI_ROUTER_SCORE_POLICY.version) throw new Error(`ai-settings: Router Score version mismatch ${payload.routerScore?.algorithmVersion || 'missing'}`);
  stage('ai-settings-render');
  await page.evaluate(() => window.EKODIAIManagement.load());
  await page.locator('#aiManagementBody .ai-mgmt-hero').waitFor({ state:'visible', timeout:8_000 });
  const state = await visiblePanelState();
  const panel = page.locator('#aiManagementPanel');
  const providerWeights = await panel.locator('[data-provider-weight]').count();
  const guards = (await panel.locator('.ai-mgmt-guards').allTextContents()).join(' ').replace(/\s+/g,' ').trim();
  const saveVisible = await panel.locator('#aiMgmtSave').isVisible();
  if (!state.panelFound || !state.selected || state.busy) throw new Error(`ai-settings panel invalid: ${JSON.stringify(state)}`);
  if (providerWeights !== Object.keys(AI_ROUTER_SCORE_POLICY.weights).length) throw new Error(`ai-settings: expected ${Object.keys(AI_ROUTER_SCORE_POLICY.weights).length} provider weights, got ${providerWeights}`);
  for (const label of ['Collaboration ON · LOCK','Cloud First · LOCK','Origin AI · LOCK','Destructive Human Gate · LOCK','Secret Server Only · LOCK']) if (!guards.includes(label)) throw new Error(`ai-settings: guard missing: ${label}`);
  if (!saveVisible) throw new Error('ai-settings: save control missing');
  results.push({ id:menuId, group, ok:true, durationMs:Date.now()-started, ...state, apiStatus:response.status, corsOrigin, routerScoreVersion:payload.routerScore.algorithmVersion, routerWeightCount:providerWeights, revision:Number(payload.revision)||0, source:payload.source||'unknown', productionMutation:false });
}

async function verifyLanguageStatus(tab, alreadyActive, started) {
  stage('language-status-ready');
  if (!alreadyActive) await clickFast(tab);
  await page.waitForFunction(() => typeof window.EKODILanguageStatus?.load === 'function', null, { timeout: 10_000 });
  stage('language-status-api');
  const response = await fetch('https://api.ekodi.kr/api/control/language-status', {
    headers: { accept:'application/json', authorization:`Bearer ${token}`, origin:'https://admin.ekodi.kr' },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== 200) throw new Error(`language-status: API returned HTTP ${response.status}`);
  const payload = await response.json().catch(() => ({}));
  if (!Array.isArray(payload.sites) || !Array.isArray(payload.languages)) throw new Error('language-status: invalid payload');
  if (!payload.sites.some(site => site.id === 'ekodi')) throw new Error('language-status: root site missing');
  if (payload.sites.some(site => !Array.isArray(site.languages))) throw new Error('language-status: site languages missing');
  stage('language-status-render');
  await page.evaluate(() => window.EKODILanguageStatus.load());
  const rootCard = page.locator('[data-language-site="ekodi"]');
  await rootCard.waitFor({ state:'visible', timeout:8_000 });
  const panel = page.locator('#languageStatusPanel');
  const state = await visiblePanelState();
  const controls = await panel.locator('form,input[type="checkbox"],button[type="submit"]').count();
  const text = String(await panel.textContent() || '').replace(/\s+/g,' ').trim();
  if (!state.panelFound || !state.selected || state.busy) throw new Error(`language-status panel invalid: ${JSON.stringify(state)}`);
  if (controls !== 0) throw new Error('language-status: mutation control exposed');
  if (!text.includes('사용자 화면에는 준비 완료 언어만 표시됩니다')) throw new Error('language-status: readiness message missing');
  results.push({ id:menuId, group, ok:true, durationMs:Date.now()-started, ...state, apiStatus:response.status, sites:payload.sites.length, languages:payload.languages.length });
}

async function verifyMaturity(tab, alreadyActive, started) {
  stage('maturity-api');
  const endpoint='https://api.ekodi.kr/api/control/platform-maturity';
  const response=await fetch(endpoint,{headers:{accept:'application/json',authorization:`Bearer ${token}`,origin:'https://admin.ekodi.kr'},signal:AbortSignal.timeout(10_000)});
  if(response.status!==200)throw new Error(`maturity: API returned HTTP ${response.status}`);
  const payload=await response.json().catch(()=>({}));
  if(payload.certificationStatus!=='not-claimed'||payload.current?.certificationStatus!=='not-claimed')throw new Error('maturity: certification boundary drift');
  if(!Array.isArray(payload.model?.domains)||payload.model.domains.length<1)throw new Error('maturity: model domains missing');
  if(!Array.isArray(payload.history)||payload.history.length<1)throw new Error('maturity: history summary missing');
  if(!alreadyActive)await clickFast(tab);
  stage('maturity-render');
  await page.waitForFunction(()=>{
    const panel=document.querySelector('[data-panel~="maturity"]');
    const view=panel?.querySelector('[data-maturity-view]');
    const status=panel?.querySelector('[data-maturity-status]');
    const text=String(view?.innerText||'').replace(/\s+/g,' ').trim();
    return Boolean(panel&&view&&!view.hidden&&status?.hidden&&text.includes('종합 내부 성숙도')&&text.includes('/ 5.00'));
  },null,{timeout:10_000});
  const state=await visiblePanelState();
  const text=String(await page.locator('[data-panel~="maturity"] [data-maturity-view]').textContent()||'').replace(/\s+/g,' ').trim();
  if(!state.panelFound||!state.selected||state.busy)throw new Error(`maturity panel invalid: ${JSON.stringify(state)}`);
  if(!text.includes('외부 인증 주장 안 함'))throw new Error('maturity: certification status not rendered');
  if(text.includes('불러오지 못했습니다'))throw new Error('maturity: data load error rendered');
  results.push({id:menuId,group,ok:true,durationMs:Date.now()-started,...state,apiStatus:response.status,assessmentDate:payload.assessmentDate,historyCount:payload.history.length});
}

async function verifyRegistryHref(tab, started) {
  const definition = getAdminMenuItem(menuId);
  if (!definition?.href || definition.adminHandoff) throw new Error(`${menuId}: direct registry href contract missing`);
  const expected = new URL(definition.href);
  const source = page.locator(`.sidebar nav .nav[data-section="${menuId}"]`);
  await source.waitFor({ state:'attached', timeout:5_000 });
  const sourceHref = await source.getAttribute('href');
  const sourceTarget = await source.getAttribute('target');
  if (!sourceHref || new URL(sourceHref, baseUrl).href !== expected.href) throw new Error(`${menuId}: production registry href does not match canonical destination`);
  if (sourceTarget !== '_blank') throw new Error(`${menuId}: direct registry href must open as an isolated external admin surface`);
  stage('registry-handoff');
  const popupPromise = page.waitForEvent('popup', { timeout:10_000 });
  await clickFast(tab);
  const popup = await popupPromise;
  try {
    await popup.waitForURL(url => url.origin === expected.origin && url.pathname.replace(/\/$/, '') === expected.pathname.replace(/\/$/, ''), { waitUntil:'commit', timeout:10_000 });
    const destination = new URL(popup.url());
    const probe = await fetch(expected.href, { redirect:'manual', signal:AbortSignal.timeout(10_000) });
    if (probe.status < 200 || probe.status >= 400) throw new Error(`${menuId}: destination returned HTTP ${probe.status}`);
    const html = await probe.text();
    if (html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length < 4) throw new Error(`${menuId}: destination did not render meaningful content`);
    if (menuId === 'cmpmyi' && (probe.headers.get('x-ekodi-route') !== 'cmpmyi-store-portfolio-admin' || !html.includes('통합 매장 운영'))) throw new Error('cmpmyi: dedicated portfolio admin contract missing');
    results.push({ id:menuId, group, ok:true, durationMs:Date.now()-started, destination:destination.href, destinationStatus:probe.status, route:probe.headers.get('x-ekodi-route')||'' });
  } finally {
    await popup.close().catch(() => {});
  }
}

async function verifyNormal(tab, alreadyActive, started) {
  if (!alreadyActive) await clickFast(tab);
  stage('panel');
  await page.waitForFunction(section => {
    return [...document.querySelectorAll('[data-panel]')].some(node => {
      const ids = String(node.dataset.panel || '').split(/\s+/).filter(Boolean);
      const style = getComputedStyle(node);
      const text = String(node.innerText || '').replace(/\s+/g, ' ').trim();
      return ids.includes(section) && !node.hidden && !node.classList.contains('hidden-panel') && style.display !== 'none' && style.visibility !== 'hidden' && text.length >= 4;
    });
  }, menuId, { timeout: 8_000 });
  let state = await visiblePanelState();
  if (!state.panelFound || !state.selected || state.textLength < 4) throw new Error(`panel invalid: ${JSON.stringify(state)}`);
  if (state.busy) {
    await waitForSettledPanel();
    state = await visiblePanelState();
    if (state.busy) throw new Error(`loading indicator remained active: ${JSON.stringify(state)}`);
  }
  results.push({ id: menuId, group, ok: true, durationMs: Date.now() - started, ...state });
}

try {
  stage('browser');
  browser = await chromium.launch({ headless: true, timeout: 20_000 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  context.setDefaultTimeout(5_000);
  context.setDefaultNavigationTimeout(15_000);
  page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('requestfailed', request => {
    try { const url = new URL(request.url()); if (url.hostname === 'admin.ekodi.kr' && /\.(?:js|css)(?:$|\?)/.test(url.pathname + url.search)) failedAdminAssets.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'failed'}`); } catch {}
  });

  stage('navigation');
  await page.goto(authenticatedEntryUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await waitForReady();
  stage('registry');
  const productionOrder = await page.evaluate(() => window.EKODIAdminPanels?.visibleMenuOrder || []);
  if (productionOrder.length !== menuIds.length) throw new Error(`Expected ${menuIds.length} visible menus, got ${productionOrder.length}`);
  for (const id of menuIds) if (!productionOrder.includes(id)) throw new Error(`Production menu registry missing ${id}`);

  const started = Date.now();
  await selectWorkArea();
  if (menuId === 'tax') await waitForAdminNavigationIdle();
  stage('tab');
  const tab = page.locator(`button.admin-context-tab[data-admin-context-section="${menuId}"]`);
  await tab.waitFor({ state: 'visible', timeout: 5_000 });
  const aria = await tab.getAttribute('aria-selected');
  const classes = String(await tab.getAttribute('class') || '');
  let alreadyActive = aria === 'true' || classes.split(/\s+/).includes('active');
  if (alreadyActive) {
    stage('active-panel-check');
    const activeState = await visiblePanelState();
    alreadyActive = Boolean(activeState.panelFound && activeState.selected && activeState.textLength >= 4);
  }
  if (menuId === 'storage') await verifyStorage(tab, alreadyActive, started);
  else if (menuId === 'tax') await verifyTax(tab, alreadyActive, started);
  else if (menuId === 'public-site-controls') await verifyPublicSiteControls(tab, alreadyActive, started);
  else if (menuId === 'language-status') await verifyLanguageStatus(tab, alreadyActive, started);
  else if (menuId === 'maturity') await verifyMaturity(tab, alreadyActive, started);
  else if (menuId === 'ai-settings') await verifyAiSettings(tab, alreadyActive, started);
  else if (getAdminMenuItem(menuId)?.href && !getAdminMenuItem(menuId)?.adminHandoff) await verifyRegistryHref(tab, started);
  else await verifyNormal(tab, alreadyActive, started);

  stage('diagnostics');
  if (failedAdminAssets.length) throw new Error(`Admin JS/CSS request failures: ${failedAdminAssets.join(' | ')}`);
  if (pageErrors.length) throw new Error(`Uncaught page errors: ${pageErrors.join(' | ')}`);
  const serious = consoleErrors.filter(text => /(?:TypeError|ReferenceError|SyntaxError|uncaught|failed to load module|blocked untrusted admin handoff)/i.test(text));
  if (serious.length) throw new Error(`Serious console errors: ${serious.join(' | ')}`);
} catch (error) {
  fatal = error;
  console.error(`[E2E:${menuId}] fatal stage=${currentStage} ${error?.stack || error}`);
} finally {
  const report = {
    generatedAt: new Date().toISOString(), baseUrl, menuId, expectedMenuCount: 1,
    checkedMenuCount: results.length, passed: !fatal, lastStage: currentStage, results,
    diagnostics: { pageErrors, consoleErrors: consoleErrors.slice(-40), failedAdminAssets },
    error: fatal ? String(fatal?.stack || fatal?.message || fatal) : null,
  };
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  if (browser) await browser.close().catch(() => {});
}

if (fatal) throw fatal;
console.log(`[E2E:${menuId}] passed`);