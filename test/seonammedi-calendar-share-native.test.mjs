import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const script=await readFile(new URL('../scripts/verify-seonammedi-calendar-share-native.mjs',import.meta.url),'utf8');
const workflow=await readFile(new URL('../.github/workflows/verify-seonammedi-calendar-share-native.yml',import.meta.url),'utf8');

test('own Chromium verifies both production hosts and desktop/mobile without third-party browser control',()=>{
  assert.match(script,/from 'playwright'/);
  assert.match(script,/'https:\/\/seonammedi\.kr':'\/board\/notices'/);
  assert.match(script,/'https:\/\/ekodi\.kr':'\/seonammedi\/board\/notices'/);
  assert.match(script,/name:'desktop',width:1440,height:900,isMobile:false/);
  assert.match(script,/name:'mobile',width:390,height:844,isMobile:true/);
  assert.match(script,/chromium\.launch\(\{headless:true\}\)/);
  assert.doesNotMatch(script,/tinyfish|selenium-grid|connectOverCDP|userDataDir|persistentContext/i);
});
test('production is entirely read-only; calendar item is supplied only as a network-isolated fixture',()=>{
  assert.match(script,/networkFixture:true,realPublishedEvent:false/);
  assert.match(script,/realGoogleAuthentication:false,realSystemShareSheet:false/);
  assert.match(script,/productionMutationsAllowed:false/);
  assert.match(script,/route\.abort\('blockedbyclient'\)/);
  assert.match(script,/url\.pathname==='\/api\/seonammedi\/calendar'/);
  assert.match(script,/url\.searchParams\.has\('month'\)/);
  assert.match(script,/route\.fulfill\(\{/);
  assert.match(script,/blockedMutations\.some/);
  assert.match(script,/unexpected_calendar_or_board_mutation_attempt/);
  assert.match(script,/row\.blockedRequestPaths/);
  assert.doesNotMatch(script,/localStorage\.setItem|sessionStorage\.setItem|POST[('"]|DELETE[('"]|PUT[('"]|E2E_ADMIN_TOKEN|BOARD_CANARY_GOOGLE_TOKEN/);
});
test('fixture click verifies clipboard, Web Share payload, direct-link focus and page title',()=>{
  assert.match(script,/\.seonam-calendar-event\.is-shared/);
  assert.match(script,/button\.seonam-calendar-copy/);
  assert.match(script,/navigator\.clipboard\.readText\(\)/);
  assert.match(script,/button\.seonam-calendar-share/);
  assert.match(script,/__ekodiRecordedShare/);
  assert.match(script,/clipboardMatches/);
  assert.match(script,/webShareArgumentsMatch/);
  assert.match(script,/browserTabTitle/);
  assert.match(script,/realSystemShareSheet:false/);
  assert.match(script,/await page\.screenshot/);
});
test('GitHub workflow runs source or post-deploy native Chromium on both domains with artifact evidence',()=>{
  assert.match(workflow,/workflow_run:/);
  assert.match(workflow,/Deploy EKODI Shared Site Core/);
  assert.match(workflow,/playwright@1\.55\.0/);
  assert.match(workflow,/npx playwright install --with-deps chromium/);
  assert.match(workflow,/--origin=https:\/\/seonammedi\.kr/);
  assert.match(workflow,/--origin=https:\/\/ekodi\.kr/);
  assert.match(workflow,/node --test test\/seonammedi-calendar-share-native\.test\.mjs/);
  assert.match(workflow,/actions\/upload-artifact@v4/);
  assert.match(workflow,/permissions:\n  contents: read/);
  assert.match(workflow,/cancel-in-progress: false/);
});
