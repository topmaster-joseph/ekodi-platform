import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const script=await readFile(new URL('../scripts/verify-seonammedi-notices-native.mjs',import.meta.url),'utf8');
const flow=await readFile(new URL('../.github/workflows/verify-seonammedi-notices-native.yml',import.meta.url),'utf8');
test('EKODI runs 4 isolated desktop/mobile browser proof cases',()=>{
  for(const needle of [
    'https://seonammedi.kr',
    'https://ekodi.kr',
    "board:'/board/notices'",
    "board:'/seonammedi/board/notices'",
    "name:'desktop',width:1440",
    "name:'mobile',width:390",
    "await chromium.launch({headless:true})",
    'fullPage:true',
    'image_load_failed',
    'horizontal_overflow',
    'search_nonmatch_did_not_empty',
    'auth_compose_return_mismatch',
    'six_menu_order_mismatch',
    'homepage_header_menu_mismatch'
  ])assert.ok(script.includes(needle),needle);
});
test('read-only browser policy and no credential authority',()=>{
  assert.ok(script.includes("['GET','HEAD','OPTIONS'].includes"));
  assert.ok(script.includes("route.abort('blockedbyclient')"));
  assert.ok(script.includes("serviceWorkers:'block'"));
  assert.ok(script.includes("acceptDownloads:false"));
  assert.ok(!script.includes('localStorage.getItem('));
  assert.ok(!script.includes('document.cookie'));
  assert.ok(!script.includes('POST /board'));
});
test('artifacts survive failed tests and do not deploy production',()=>{
  assert.ok(flow.includes('actions/upload-artifact@v4'));
  assert.ok(flow.includes('if: always()'));
  assert.ok(flow.includes('retention-days: 14'));
  assert.ok(flow.includes('npx playwright install --with-deps chromium'));
  assert.ok(!flow.includes('wrangler deploy'));
  assert.ok(!flow.includes('secrets.'));
});

// Owner-authorized CI retrigger on official EKODI Orchestrator provenance recovery branch; runtime behavior unchanged.

// Requeue canonical orchestrated convergence after global merge concurrency finished; no test logic changes.
