import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../scripts/verify-admin-production-ui-e2e.mjs',import.meta.url),'utf8');

test('production Admin E2E retries asynchronous route drift through real left navigation once',()=>{
  assert.match(source,/selected panel changed during mount; bounded real-navigation recovery/);
  assert.match(source,/if \(!await groupActive\(\)\)/);
  assert.match(source,/const retryTrigger = await resolveMenuTrigger\(id,group\)/);
  assert.match(source,/await dispatchClick\(retryTrigger\)/);
  assert.match(source,/real menu activation did not stabilize after bounded retry/);
  assert.match(source,/before,after/);
  assert.match(source,/if \(id === 'command-home'\) throw initialError/);
  assert.match(source,/console\.warn\(`\[PROD-E2E\]/);
});

test('navigation retry cannot falsely pass invisible panels or expand fake permissions',()=>{
  const start=source.indexOf('selected panel changed during mount; bounded real-navigation recovery');
  const end=source.indexOf("if (id === 'command-home') {",start);
  assert.ok(start>0&&end>start);
  const retry=source.slice(start,end);
  assert.doesNotMatch(retry,/route\.fulfill|status:\s*200|authenticated:\s*true|\.catch\(\(\)=>true\)/);
  assert.match(retry,/page\.waitForFunction\(section => window\.EKODIAdminPanels\?\.current\?\.\(\) === section, id, \{ timeout: 20000 \}\)/);
  assert.match(source,/if \(activeCount !== expectedCount\) throw new Error/);
});
