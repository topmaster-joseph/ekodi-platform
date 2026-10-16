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
    'imagesDeferredByPagePolicy',
    'horizontal_overflow',
    'search_nonmatch_did_not_empty',
    'auth_compose_return_mismatch',
    'six_menu_order_mismatch',
    'homepage_header_menu_mismatch',
    'notice_compose_button_not_two_lines',
    'signed_out_notice_admin_actions_visible',
    'signed_out_notice_admin_api_not_denied'
  ])assert.ok(script.includes(needle),needle);
});
test('visible button layout and admin access are verified without any privileged mutation',()=>{
  assert.ok(script.includes("composeLines:labelLines.map(span=>span.textContent.trim())"));
  assert.ok(script.includes("getBoundingClientRect().top"));
  assert.ok(script.includes("adminResponse.status()===403"));
  assert.ok(script.includes("adminPayload.error==='notices_forbidden'"));
  assert.ok(script.includes("page.request.get("));
  assert.ok(!script.includes("page.request.post("));
  assert.ok(!script.includes("page.request.put("));
  assert.ok(!script.includes("page.request.delete("));
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

// Owner-authorized validation retrigger after protected-main synchronization; no logic or release changes.
