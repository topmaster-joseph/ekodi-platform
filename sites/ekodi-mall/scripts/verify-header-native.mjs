// Read-only EKODI-owned Chromium canary for the PUBLIC Mall header.
// The "member" is a browser-local synthetic /auth/v1/user response. This test
// never possesses a production credential, never checks out, and never signs out.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const canonical = 'https://ekodi.kr/ekodimall/?category=book';
const syntheticSessionKey = 'sb-renzehysxirjilvdxacv-auth-token';
const outDir = 'artifacts/mall-header-native';
const widths = [1440, 1366, 900, 768, 390, 320];
const report = {
  schemaVersion: 'mall-header-native-canary.v1',
  capturedAt: new Date().toISOString(),
  releaseCandidateSha: process.env.GITHUB_SHA || 'local',
  url: canonical,
  credentialMode: 'browser-local-synthetic-only',
  liveAccountSignInProven: false,
  purchaseOrLogoutPerformed: false,
  candidateCssInjected: process.env.GITHUB_EVENT_NAME === 'pull_request',
  liveCssValidated: process.env.GITHUB_EVENT_NAME !== 'pull_request',
  results: [],
};

function rect(node) {
  if (!node) return null;
  const v = node.getBoundingClientRect();
  return { x: Math.round(v.x), y: Math.round(v.y),
    width: Math.round(v.width), height: Math.round(v.height),
    right: Math.round(v.right), bottom: Math.round(v.bottom) };
}

async function examine(page, width, synthetic) {
  const result = await page.evaluate(() => {
    const r = node => {
      if (!node) return null;
      const v = node.getBoundingClientRect();
      return { x: Math.round(v.x), y: Math.round(v.y),
        width: Math.round(v.width), height: Math.round(v.height),
        right: Math.round(v.right), bottom: Math.round(v.bottom) };
    };
    const visible = node => Boolean(node) && !node.hidden &&
      getComputedStyle(node).display !== 'none' &&
      getComputedStyle(node).visibility !== 'hidden' &&
      r(node)?.width > 0;
    const top = document.querySelector('.mall-header-top');
    const search = document.querySelector('#mallGlobalSearch');
    const account = document.querySelector('[data-mall-account]');
    const signed = document.querySelector('[data-mall-signed]');
    const guestLogin = document.querySelector('[data-mall-login]');
    const logout = document.querySelector('[data-mall-logout]');
    const nav = document.querySelector('.mall-primary-nav');
    const navLabels = [...(nav?.querySelectorAll('a') || [])].map(n => n.textContent.trim());
    return {
      viewportWidth: window.innerWidth,
      top: r(top), search: r(search), account: r(account),
      member: String(document.querySelector('[data-mall-id]')?.textContent || '').trim(),
      signedVisible: visible(signed),
      guestLoginVisible: visible(guestLogin),
      logoutVisible: visible(logout),
      logoutText: String(logout?.textContent || '').trim(),
      wishlistPreserved: Boolean(document.querySelector('#wishBtn,#wishCount')),
      sellerPreserved: Boolean(document.querySelector('.mall-header .seller-mini')),
      originalMobileSearchPreserved: Boolean(document.querySelector('.mall-search-mobile')),
      navLabels,
      duplicateAccountCount: navLabels.filter(
        t => t === '비비큐청계점' || t === 'bbqmuancg@gmail.com'
      ).length,
      publicBookCardCount: document.querySelectorAll(
        '.card[data-product][data-category="book"]'
      ).length,
    };
  });
  // Numeric-only CSS evidence is emitted before assertions so failures identify
  // the exact computed width and cascade without logging URLs or credentials.
  const searchStyle = await page.evaluate(() => {
    const el = document.querySelector('#mallGlobalSearch');
    if (!el) return null;
    const css = getComputedStyle(el);
    return { width: css.width, minWidth: css.minWidth, maxWidth: css.maxWidth,
      display: css.display, gridArea: css.gridArea };
  });
  console.log('[MALL-HEADER-NATIVE] geometry ' + JSON.stringify({
    viewport: width, synthetic, candidateCssInjected: report.candidateCssInjected,
    search: result.search, account: result.account, style: searchStyle,
  }));
  assert.ok(result.top && result.search && result.account, 'canonical Mall header missing');
  assert.ok(result.originalMobileSearchPreserved, 'original mobile search control lost');
  assert.ok(result.wishlistPreserved && result.sellerPreserved, 'seller or wishlist navigation lost');
  assert.equal(result.duplicateAccountCount, 0, 'account duplicated in shopping categories');
  assert.ok(result.search.width > 100 && result.search.width <= 312,
    'compact search unexpectedly wide or collapsed at ' + width + 'px');
  assert.ok(result.account.x >= 0 && result.account.right <= width + 2,
    'account/logout clipped outside viewport at ' + width + 'px');
  assert.ok(result.search.x >= 0 && result.search.right <= width + 2,
    'search clipped outside viewport at ' + width + 'px');
  if (width >= 901) {
    assert.ok(result.account.x >= result.search.right - 3,
      'account must be to the right of the search at ' + width + 'px');
    assert.ok(Math.abs(result.account.y - result.search.y) < 25,
      'desktop account/search no longer share a row');
  }
  if (synthetic) {
    assert.equal(result.member, '비비큐청계점', 'verified synthetic account alias missing');
    assert.ok(result.signedVisible && result.logoutVisible,
      'verified member and logout must both remain visible');
    assert.equal(result.logoutText, '로그아웃');
    assert.equal(result.guestLoginVisible, false);
  } else {
    assert.equal(result.guestLoginVisible, true, 'public guest login hidden');
    assert.equal(result.signedVisible, false, 'guest must not appear signed in');
    assert.equal(result.logoutVisible, false, 'guest must not see logout');
  }
  return result;
}

function installSyntheticIdentity(context) {
  return context.addInitScript(({ key }) => {
    const origFetch = window.fetch.bind(window);
    // Auth is simulated ONLY inside this ephemeral browser context.
    window.fetch = async (input, options) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (String(url).includes('/auth/v1/user')) {
        return new Response(JSON.stringify({
          id: 'e2e-synthetic-verified-member', email: 'bbqmuancg@gmail.com',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return origFetch(input, options);
    };
    localStorage.setItem(key, JSON.stringify({
      access_token: 'synthetic-test-token-no-production-authority',
      expires_at: 4102444800,
    }));
  }, { key: syntheticSessionKey });
}

async function run() {
  await mkdir(outDir, { recursive: true });
  // On PR the real site is still on main: overlay the candidate CSS in this
  // isolated browser only. After protected deployment, use real production CSS.
  const candidateCss = report.candidateCssInjected
    ? await readFile(new URL('../assets/mall-account-header.css', import.meta.url), 'utf8')
    : null;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of widths) {
      for (const synthetic of [false, true]) {
        // Minimal fresh context prevents contamination between guest and mock
        // member checks. No real personal browser profile or cookies are used.
        const context = await browser.newContext({
          viewport: { width, height: 860 }, locale: 'ko-KR',
          serviceWorkers: 'block',
        });
        try {
          if (synthetic) await installSyntheticIdentity(context);
          const page = await context.newPage();
          await page.goto(canonical, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector('[data-mall-account]', { timeout: 15000 });
          if (candidateCss) await page.addStyleTag({ content: candidateCss });
          await page.waitForFunction(
            isMember => isMember
              ? document.querySelector('[data-mall-id]')?.textContent?.trim() === '비비큐청계점'
              : document.querySelector('[data-mall-login]')?.hidden === false,
            synthetic, { timeout: 16000 }
          );
          // Allow legacy nav scripts / MutationObserver to settle.
          await page.waitForTimeout(350);
          if (synthetic && width === 1366) {
            // Pure DOM-only test: a late duplicate must be removed without
            // deleting an unrelated category anchor.
            await page.evaluate(() => {
              const nav = document.querySelector('.mall-primary-nav');
              const injected = document.createElement('a');
              injected.textContent = '비비큐청계점';
              injected.href = '#shop';
              injected.dataset.e2eSyntheticDuplicate = '1';
              nav.append(injected);
            });
            await page.waitForFunction(
              () => !document.querySelector('[data-e2e-synthetic-duplicate]'),
              null,
              { timeout: 5000 }
            );
          }
          const result = await examine(page, width, synthetic);
          report.results.push({ device: width <= 390 ? 'mobile' : 'desktop',
            width, mode: synthetic ? 'synthetic-member' : 'guest', ...result });
          if ((width === 1366 || width === 390) && synthetic) {
            // No real account or personal credential exists in this screenshot.
            await page.screenshot({
              path: outDir + '/synthetic-header-' + width + '.png',
              fullPage: false,
            });
          }
          console.log('[MALL-HEADER-NATIVE] PASS width=' + width +
            ' mode=' + (synthetic ? 'synthetic-member' : 'guest') +
            ' search=' + result.search.width + 'px nav-duplicate=' +
            result.duplicateAccountCount);
        } finally {
          await context.close();
        }
      }
    }
    await writeFile(outDir + '/evidence.json',
      JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log('[MALL-HEADER-NATIVE] all guest/synthetic responsive checks passed');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('[MALL-HEADER-NATIVE] fail closed: ' +
    String(err?.message || err).slice(0, 600));
  process.exitCode = 1;
});
