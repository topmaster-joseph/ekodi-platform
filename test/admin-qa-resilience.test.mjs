import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const admin=readFileSync(new URL('../scripts/verify-admin-production-ui-e2e.mjs',import.meta.url),'utf8');
const browser=readFileSync(new URL('../scripts/ekodi-background-browser-worker.mjs',import.meta.url),'utf8');

test('synthetic session isolates only the read-only directory and preserves security',()=>{
  assert.match(admin,/page\.route\('\*\*\/api\/customers\/directory'/);
  assert.match(admin,/\['GET','OPTIONS'\]\.includes\(route\.request\(\)\.method\(\)\)/);
  assert.match(admin,/tenants:\[\],roles:\[\],members:\[\]/);
  assert.doesNotMatch(admin,/page\.route\('\*\*\/api\/\*\*'/);
});

test('every menu checks its real current group and bounded retries instead of stale loop state',()=>{
  assert.match(admin,/selectedWorkArea !== group \|\| !await groupActive\(\)/);
  assert.match(admin,/for \(let attempt=0; attempt<2; attempt\+\+\)/);
  assert.match(admin,/did not activate after bounded retries|never activated after bounded retries/);
  assert.match(admin,/await locator\.evaluate\(node => \{ node\.click\(\); return true; \}\)/);
});

test('native background browser paces mobile visits and never bypasses rate limits',()=>{
  assert.match(browser,/minimumGap=task\.deviceProfile\.includes\('mobile'\)\?2200:500/);
  assert.match(browser,/\[429,502,503,504\]/);
  assert.match(browser,/attempt<3;attempt\+\+/);
  assert.match(browser,/BROWSER_NAVIGATION_THROTTLED/);
  assert.match(browser,/BROWSER_NAVIGATION_HTTP_ERROR/);
  assert.match(browser,/recoveredNavigations/);
  assert.match(browser,/if\(!task\.allowMutation && !\['GET','HEAD','OPTIONS'\]\.includes\(method\)\)/);
  assert.doesNotMatch(browser,/ignoreHTTPSErrors:true|bypassCSP:true/);
});
