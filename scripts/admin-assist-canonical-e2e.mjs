import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const token = String(process.env.E2E_ADMIN_TOKEN || '').trim();
if (!token) throw new Error('E2E_ADMIN_TOKEN is required');

const canonicalBaseUrl = 'https://ekodi.kr/admin/';
const campusUrl = 'https://ekodi.kr/admin/home/campus';
const authEntryUrl = `${canonicalBaseUrl}?route=finance#ekodi_admin_token=${token}`;
const assistApiUrl = 'https://api.ekodi.kr/api/control/ai/assist';
const prompt = 'EKODI E2E 확인: "정상"이라고 한 단어로 답해줘.';
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
