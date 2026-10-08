import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.EKODI_PREFLIGHT_URL || 'http://127.0.0.1:8765/sites/seonammedi/public/index.html';
const browser = await chromium.launch({ headless: true });
await mkdir('artifacts/predeploy-browser', { recursive: true });
const failures = [];
try {
  for (const width of [390, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      const response = await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
      assert.equal(response?.status(), 200, 'Preview HTTP 200 required');
      await page.locator('#organization').waitFor({ state: 'attached' });
      const state = await page.evaluate(() => ({
        title: document.querySelector('#organization h2')?.textContent?.trim(),
        css: Boolean(document.querySelector('#seonammedi-organization-mobile-fix')),
        tabs: document.querySelectorAll('#organization button').length,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        sectionHeight: Math.round(document.querySelector('#organization').getBoundingClientRect().height),
      }));
      assert.equal(state.title, '조직');
      assert.equal(state.css, true);
      assert.ok(state.tabs >= 3, 'Organization tabs missing');
      assert.equal(state.overflow, false, 'Horizontal overflow');
      await page.locator('#organization').screenshot({ path: `artifacts/predeploy-browser/organization-${width}.png` });
      // Test actual tab interaction; clicking must not trigger uncaught browser exceptions.
      const tabs = page.locator('#organization button');
      for (let i = 0; i < Math.min(3, await tabs.count()); i++) {
        if (await tabs.nth(i).isVisible()) await tabs.nth(i).click({ timeout: 4000 });
      }
      assert.deepEqual(errors, [], 'Uncaught JavaScript errors');
      console.log(JSON.stringify({ width, ...state, result: 'PASS' }));
    } catch (error) {
      failures.push({ width, error: error.message, browserErrors: errors });
      await page.screenshot({ path: `artifacts/predeploy-browser/failure-${width}.png`, fullPage: true }).catch(() => {});
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
await writeFile('artifacts/predeploy-browser/results.json', JSON.stringify({ base, failures, passed: failures.length === 0 }, null, 2));
if (failures.length) { console.error(JSON.stringify(failures)); process.exitCode = 1; }
