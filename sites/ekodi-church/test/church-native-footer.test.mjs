import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Church pages preserve one native footer while mounting shared visit summary',async()=>{
  const source=await readFile('church-shell.js','utf8');
  const home=await readFile('index.html','utf8');
  const devotion=await readFile('devotion/index.html','utf8');
  assert.match(home,/footer class="site-footer church-footer" data-ekodi-service-footer/);
  assert.match(devotion,/footer class="site-footer church-footer" data-ekodi-service-footer/);
  assert.match(source,/function mountVisitSummary\(\)/);
  assert.match(source,/document\.documentElement\.dataset\.ekodiShellSurface = 'public'/);
  assert.match(source,/native-visit-beacon\.js/);
  assert.match(source,/user-ui-footer\.js/);
  assert.ok(source.indexOf("document.head.append(beacon)")<source.indexOf("document.head.append(footer)"));
  assert.match(source,/churchNativeFooter/);
  assert.match(source,/\(\?:admin\|my\)/);
  assert.ok(source.indexOf('mountVisitSummary();')<source.indexOf('if (isHome) return;'));
});

test('Church source does not introduce another telemetry backend or weaken CSP',async()=>{
  const source=await readFile('church-shell.js','utf8');
  const headers=await readFile('_headers','utf8');
  assert.doesNotMatch(source,/sendBeacon|method:\s*['"]POST/);
  assert.match(headers,/script-src 'self'/);
  assert.match(headers,/connect-src 'self'/);
});
