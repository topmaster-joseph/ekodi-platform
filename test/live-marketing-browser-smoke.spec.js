import { test, expect } from '@playwright/test';

test('live Marketing page and auth center do not stay in loading state', async ({ page }) => {
  const failed = [];
  page.on('requestfailed', req => failed.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText || 'failed'}`));

  const marketingResponse = await page.goto('https://marketing.ekodi.kr/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  expect(marketingResponse, 'marketing response').not.toBeNull();
  expect(marketingResponse.status(), 'marketing HTTP status').toBeLessThan(500);
  await page.waitForTimeout(5000);

  const marketingTitle = await page.title();
  const marketingText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
  console.log(`MARKETING_STATUS=${marketingResponse.status()}`);
  console.log(`MARKETING_URL=${page.url()}`);
  console.log(`MARKETING_TITLE=${marketingTitle}`);
  console.log(`MARKETING_TEXT=${marketingText.slice(0, 500)}`);
  expect(marketingText.length, 'Marketing page should render meaningful UI').toBeGreaterThan(80);

  const authUrl = 'https://auth.ekodi.kr/?site=marketing&return_to=https%3A%2F%2Fmarketing.ekodi.kr%2F';
  const authResponse = await page.goto(authUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  expect(authResponse, 'auth response').not.toBeNull();
  expect(authResponse.status(), 'auth HTTP status').toBe(200);

  await expect(page.locator('#googleButtonHost')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(8000);

  const status = (await page.locator('#authStatus').innerText()).trim();
  const retryVisible = await page.locator('#googleRetry').isVisible().catch(() => false);
  const iframeCount = await page.locator('#googleButtonHost iframe').count();
  const authText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
  console.log(`AUTH_STATUS_CODE=${authResponse.status()}`);
  console.log(`AUTH_URL=${page.url()}`);
  console.log(`AUTH_STATUS_TEXT=${status}`);
  console.log(`GOOGLE_IFRAME_COUNT=${iframeCount}`);
  console.log(`GOOGLE_RETRY_VISIBLE=${retryVisible}`);
  console.log(`AUTH_TEXT=${authText.slice(0, 700)}`);

  expect(status, 'Auth must not stay forever at initial loading copy').not.toContain('Google 인증을 준비하고 있습니다');
  expect(iframeCount > 0 || retryVisible, 'Google sign-in UI or retry fallback must be available').toBeTruthy();

  const relevantFailures = failed.filter(x => /ekodi\.kr|supabase\.co|accounts\.google\.com/.test(x));
  console.log(`RELEVANT_REQUEST_FAILURES=${JSON.stringify(relevantFailures.slice(0, 20))}`);
});
