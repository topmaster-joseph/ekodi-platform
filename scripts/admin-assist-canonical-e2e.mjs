import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const token = String(process.env.E2E_ADMIN_TOKEN || '').trim();
if (!token) throw new Error('E2E_ADMIN_TOKEN is required');

const canonicalBaseUrl = 'https://ekodi.kr/admin/';
const campusUrl = 'https://ekodi.kr/admin/home/campus';
const authEntryUrl = `${canonicalBaseUrl}?route=finance#ekodi_admin_token=${token}`;
const assistApiUrl = 'https://ekodi.kr/api/control/ai/assist';
const prompt = 'EKODI E2E 확인: "정상"이라고 한 단어로 답해줘.';
const EXPECTED_DESKTOP_SIDEBAR_WIDTH = 228;
const artifactsDir = path.resolve('artifacts/admin-authenticated-e2e');
const reportPath = path.join(artifactsDir, 'assist-canonical.json');
await fs.mkdir(artifactsDir, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  canonicalBaseUrl,
  campusUrl,
  assistApiUrl,
  passed: false,
  apiStatus: null,
  apiRequestVerified: false,
  replyLength: 0,
  provider: null,
  mode: null,
  historyVerified: false,
  renderedReplyLength: 0,
  inputCleared: false,
  visualContractVerified: false,
  visualState: null,
  finalUrl: null,
  error: null,
};

let browser;
try {
  browser = await chromium.launch({ headless: true, timeout: 20_000 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(20_000);

  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));

  console.log('[ASSIST-E2E] authenticate on canonical Admin');
  await page.goto(authEntryUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(sessionStorage.getItem('ekodi-auth-token')));
  await page.waitForSelector('#app:not([hidden])');
  await page.waitForFunction(() => document.querySelector('#apiState')?.textContent?.includes('정상'));

  console.log('[ASSIST-E2E] verify canonical light conversation home');
  // A transient edge HTML response may omit the Admin shell altogether.
  // Retry ONLY this token-free, same-origin canonical page once; never reenter OAuth,
  // forge authentication, or bypass the central /api/session readiness check.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await page.goto(canonicalBaseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(sessionStorage.getItem('ekodi-auth-token')));
    try {
      await page.waitForSelector('#app:not([hidden])', { timeout: 15_000 });
      await page.waitForFunction(() => document.querySelector('#apiState')?.textContent?.includes('정상'), null, { timeout: 15_000 });
      break;
    } catch (error) {
      // Deliberately avoid URLs with queries, hashes, login data and response bodies.
      const state = await page.evaluate(() => ({
        path: location.pathname,
        hasApp: Boolean(document.querySelector('#app')),
        hasLogin: Boolean(document.querySelector('#loginScreen')),
        hasCore: Boolean(window.EKODIAdminCore),
        hasSession: Boolean(sessionStorage.getItem('ekodi-auth-token')),
      })).catch(() => ({ unavailable: true }));
      const status = response?.status() ?? null;
      const contentType = String(response?.headers()?.['content-type'] || '').split(';')[0];
      console.error(`[ASSIST-E2E] canonical-home-ready attempt ${attempt}/2 ${JSON.stringify({status,contentType,...state})}`);
      if (attempt === 2 || [401, 403].includes(status) || state.path !== '/admin/') throw error;
    }
  }
  await page.waitForFunction(() => (
    document.body.classList.contains('admin-compact')
    && document.body.classList.contains('admin-command-home')
    && document.body.classList.contains('admin-control-home')
    && Boolean(document.querySelector('#ekodiControlHomeFrame'))
  ), null, {timeout: 15_000});
  await page.waitForSelector('.sidebar', {state:'visible'});
  const frame=page.frameLocator('#ekodiControlHomeFrame');
  await frame.locator('#commandInput').waitFor({state:'visible',timeout:15_000});
  await frame.locator('#controlEmbeddedToolbar').waitFor({state:'visible',timeout:15_000});
  report.visualState = await page.evaluate(() => {
    const sidebar=document.querySelector('.sidebar');
    const iframe=document.querySelector('#ekodiControlHomeFrame');
    const main=document.querySelector('.app > main');
    const contextTabs=document.querySelector('.admin-context-tabs-shell');
    const commandEntry=document.querySelector('.admin-command-entry');
    const style=getComputedStyle(document.body);
    const nav=sidebar?.getBoundingClientRect();
    const panel=iframe?.getBoundingClientRect();
    return {
      colorScheme:style.colorScheme,
      bodyBackground:style.backgroundColor,
      sidebarBackground:sidebar?getComputedStyle(sidebar).backgroundColor:null,
      sidebarWidth:nav?.width||0,
      sidebarRight:nav?.right||0,
      frameLeft:panel?.left||0,
      frameWidth:panel?.width||0,
      frameHeight:panel?.height||0,
      contextTabsPresent:Boolean(contextTabs),
      commandEntryPresent:Boolean(commandEntry),
      nestedControlRailPresent:Boolean(iframe),
      mainHeight:main?.getBoundingClientRect().height||0,
    };
  });
  const visual=report.visualState;
  if(!String(visual?.colorScheme||'').includes('light'))throw new Error('Admin home color scheme is not light: '+visual?.colorScheme);
  if(visual?.bodyBackground!=='rgb(255, 255, 255)')throw new Error('Admin body is not white: '+visual?.bodyBackground);
  if(visual?.sidebarBackground!=='rgb(247, 248, 252)')throw new Error('Admin sidebar light surface mismatch: '+visual?.sidebarBackground);
  if(Math.round(visual?.sidebarWidth||0)!==EXPECTED_DESKTOP_SIDEBAR_WIDTH)throw new Error('Admin sidebar width mismatch: '+visual?.sidebarWidth);
  if(visual?.contextTabsPresent||visual?.commandEntryPresent)throw new Error('Admin redundant navigation chrome is visible');
  if(visual?.frameWidth<300||visual?.frameHeight<300||Math.abs(visual.frameLeft-visual.sidebarRight)>2)throw new Error('Admin Control/sidebar alignment mismatch: '+JSON.stringify(visual));
  report.visualContractVerified = true;
  await page.screenshot({ path: path.join(artifactsDir, 'admin-home-visual.png'), fullPage: true });

  console.log('[ASSIST-E2E] open canonical campus route');
  await page.goto(campusUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(sessionStorage.getItem('ekodi-auth-token')));
  await page.waitForSelector('#app:not([hidden])');
  await page.waitForFunction(() => document.querySelector('#apiState')?.textContent?.includes('정상'));
  const canonicalLocation = new URL(page.url());
  if (canonicalLocation.hostname !== 'ekodi.kr' || canonicalLocation.pathname !== '/admin/home/campus') {
    throw new Error(`Canonical campus route mismatch: ${page.url()}`);
  }

  const input = page.locator('#ekodiAssistBootstrap input');
  await input.waitFor({ state: 'visible', timeout: 15_000 });
  await input.fill(prompt);

  console.log('[ASSIST-E2E] submit through bottom command input');
  const responsePromise = page.waitForResponse(response => {
    return response.url() === assistApiUrl && response.request().method() === 'POST';
  }, { timeout: 30_000 });
  await input.press('Enter');
  const response = await responsePromise;
  report.apiStatus = response.status();
  if (!response.ok()) throw new Error(`Assist API returned HTTP ${response.status()}`);

  const requestBody = response.request().postDataJSON?.() || {};
  if (String(requestBody.message || '') !== prompt) {
    throw new Error('Assist API request did not contain the submitted bottom-dock command');
  }
  report.apiRequestVerified = true;

  const payload = await response.json().catch(() => ({}));
  const reply = String(payload.reply || '').trim();
  if (!reply) throw new Error('Assist API returned an empty reply');
  report.replyLength = reply.length;
  report.provider = payload.provider || null;
  report.mode = payload.mode || null;

  await page.waitForSelector('#ekodiAssistPanel:not([hidden])', { timeout: 10_000 });
  await page.waitForFunction(expectedPrompt => {
    try {
      const sessions = JSON.parse(sessionStorage.getItem('ekodi-admin-command-history-v1') || '[]');
      return sessions.some(session => {
        const messages = Array.isArray(session?.messages) ? session.messages : [];
        const userSeen = messages.some(message => message?.role === 'user' && message?.text === expectedPrompt);
        const assistantSeen = messages.some(message => message?.role === 'assistant' && String(message?.text || '').trim() && message?.status !== 'failed');
        return userSeen && assistantSeen;
      });
    } catch {
      return false;
    }
  }, prompt, { timeout: 15_000 });
  report.historyVerified = true;

  await page.waitForFunction(() => {
    const bubbles = [...document.querySelectorAll('#ekodiAssistChat .ekodi-assist-turn.assistant .ekodi-assist-bubble')];
    return bubbles.some(node => String(node.textContent || '').trim().length > 0);
  }, null, { timeout: 15_000 });
  report.renderedReplyLength = await page.locator('#ekodiAssistChat .ekodi-assist-turn.assistant .ekodi-assist-bubble').last().evaluate(node => String(node.textContent || '').trim().length);

  report.inputCleared = (await input.inputValue()) === '';
  if (!report.inputCleared) throw new Error('Bottom command input was not cleared after accepted submission');
  if (pageErrors.length) throw new Error(`Page error during Assist round-trip: ${pageErrors.join(' | ')}`);

  report.finalUrl = page.url();
  report.passed = true;
  console.log(`[ASSIST-E2E] passed status=${report.apiStatus} provider=${report.provider || 'fallback'} mode=${report.mode || 'unknown'} replyLength=${report.replyLength}`);
} catch (error) {
  report.error = String(error?.stack || error?.message || error);
  console.error(`[ASSIST-E2E] failed: ${error?.message || error}`);
  if (browser) {
    const pages = browser.contexts().flatMap(context => context.pages());
    const page = pages[0];
    if (page) await page.screenshot({ path: path.join(artifactsDir, 'assist-canonical-failure.png'), fullPage: true }).catch(() => {});
  }
} finally {
  report.generatedAt = new Date().toISOString();
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  await browser?.close().catch(() => {});
}

if (!report.passed) process.exit(1);
