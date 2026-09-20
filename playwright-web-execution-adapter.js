const clean = (value, limit = 500) => String(value ?? '').trim().slice(0, limit);
const ALLOWED_ACTIONS = new Set(['goto','click','fill','press','wait_for','extract_text','extract_attribute']);
const DEFAULT_TIMEOUT_MS = 15_000;

function assertHttpUrl(value) {
  const url = new URL(String(value));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('WEB_EXECUTION_PROTOCOL_FORBIDDEN');
  return url.toString();
}
function normalizeStep(step = {}) {
  const action = clean(step.action, 40).toLowerCase();
  if (!ALLOWED_ACTIONS.has(action)) throw new Error('WEB_EXECUTION_ACTION_UNSUPPORTED');
  return Object.freeze({
    action,
    selector: clean(step.selector, 300),
    value: clean(step.value, 2000),
    attribute: clean(step.attribute, 120),
    url: step.url ? assertHttpUrl(step.url) : '',
  });
}
async function runStep(page, step) {
  if (step.action === 'goto') { await page.goto(step.url, { waitUntil: 'domcontentloaded' }); return null; }
  if (step.action === 'click') { await page.locator(step.selector).click(); return null; }
  if (step.action === 'fill') { await page.locator(step.selector).fill(step.value); return null; }
  if (step.action === 'press') { await page.locator(step.selector).press(step.value); return null; }
  if (step.action === 'wait_for') { await page.locator(step.selector).waitFor({ state: 'visible' }); return null; }
  if (step.action === 'extract_text') return page.locator(step.selector).innerText();
  if (step.action === 'extract_attribute') return page.locator(step.selector).getAttribute(step.attribute);
  throw new Error('WEB_EXECUTION_ACTION_UNSUPPORTED');
}

export function createPlaywrightWebExecutionAdapter(options = {}) {
  const chromium = options.chromium;
  if (!chromium || typeof chromium.launch !== 'function') throw new TypeError('chromium launcher is required');
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
  return Object.freeze({
    id: options.id || 'ekodi-playwright',
    engine: 'chromium-playwright',
    trustClass: 'ekodi-owned',
    costClass: options.costClass || 'free',
    available: options.available !== false,
    async invoke(task = {}) {
      const steps = (Array.isArray(task.steps) ? task.steps : []).map(normalizeStep);
      if (!steps.length) throw new Error('WEB_EXECUTION_EMPTY_PLAN');
      const browser = await chromium.launch({ headless: options.headless !== false });
      const context = await browser.newContext({ ignoreHTTPSErrors: false });
      const page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      const outputs = [];
      try {
        for (const step of steps) {
          const value = await runStep(page, step);
          if (value !== null && value !== undefined) outputs.push(value);
        }
        return Object.freeze({ ok: true, verified: false, outputs: Object.freeze(outputs), taskClass: clean(task.taskClass, 80) || 'browser-plan', siteClass: clean(task.siteClass, 80) || 'web', cost: 0 });
      } finally {
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
      }
    },
  });
}
