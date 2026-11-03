import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const NATIVE_PAGES = [
  'sites/ekodi-church/index.html',
  'space/ekodimission.page',
  'sites/seonammedi/public/index.html',
  'sites/ekodi-lab/index.html',
  'ekodibiz/index.html',
];

test('native public site footers use the existing shared traffic module without a second footer', async () => {
  for (const path of NATIVE_PAGES) {
    const source = await readFile(path, 'utf8');
    assert.match(source, /<html[^>]*data-ekodi-shell-surface="public"/, path);
    assert.match(source, /<script src="https:\/\/ekodi\.kr\/shell\/user-ui-footer\.js" defer><\/script>/, path);
    assert.equal((source.match(/shell\/user-ui-footer\.js/g) || []).length, 1, path);
    assert.match(source, /<footer\b/, path);
    assert.doesNotMatch(source, /data-ekodi-user-footer=/, path);
  }
});

test('CGMA gateway adopts traffic module on public HTML, retaining existing route handling', async () => {
  const source = await readFile('platform-router-entry-worker.js', 'utf8');
  assert.match(source, /function injectCgmaFooterTraffic\(response, request\)/);
  assert.match(source, /response\.status!==200/);
  assert.match(source, /!String\(response\.headers\.get\('content-type'\)/);
  assert.match(source, /setAttribute\('data-ekodi-shell-surface','public'\)/);
  assert.match(source, /src="https:\/\/ekodi\.kr\/shell\/user-ui-footer\.js"/);
  assert.match(source, /routeCgmaPublic\(request,env,fetchImpl=fetch\)/);
  assert.match(source, /injectCgmaFooterTraffic\(await cgmaPublicPassthrough\(request,fetchImpl\),request\)/);
  assert.match(source, /injectCgmaFooterTraffic\(injectCgmaRegionalLinks\(/);
  assert.match(source, /\(\?:admin\|auth\|api\)/);
});

test('public counters retain existing privacy and native-footer deduplication behavior', async () => {
  const shared = await readFile('shell/user-ui-footer.js', 'utf8');
  const backend = await readFile('traffic-intelligence-control.js', 'utf8');
  assert.match(shared, /attachFooterTraffic\(nativeFooter\(\)\)/);
  assert.match(shared, /if\(node\.dataset\.ekodiTrafficScope===scope\)return/);
  assert.match(backend, /count > 0 && count < 5/);
  assert.match(backend, /anonymous_browser_sessions/);
  assert.match(backend, /cache-control', 'public, max-age=300/);
});
