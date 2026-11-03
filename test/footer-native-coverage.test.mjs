import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const NATIVE_PAGES = [
  'sites/seonammedi/public/index.html',
  'sites/ekodi-lab/index.html',
  'ekodibiz/index.html',
];

test('native public sites load read-only footer and separate beacon with one native footer', async () => {
  for (const path of NATIVE_PAGES) {
    const source = await readFile(path, 'utf8');
    assert.match(source, /<html[^>]*data-ekodi-shell-surface="public"/, path);
    assert.match(source, /<script src="https:\/\/ekodi\.kr\/shell\/native-visit-beacon\.js" defer><\/script>/, path);
    assert.match(source, /<script src="https:\/\/ekodi\.kr\/shell\/user-ui-footer\.js" defer><\/script>/, path);
    assert.ok(source.indexOf('native-visit-beacon.js') < source.indexOf('user-ui-footer.js'), path);
    assert.equal((source.match(/shell\/user-ui-footer\.js/g) || []).length, 1, path);
    assert.match(source, /<footer\b/, path);
    assert.doesNotMatch(source, /data-ekodi-user-footer=/, path);
  }
});

test('immutable Church shadow copy is not mutated by a local native-footer change', async () => {
  const index = await readFile('sites/ekodi-church/index.html', 'utf8');
  assert.doesNotMatch(index, /native-visit-beacon\.js|shell\/user-ui-footer\.js/);
});

test('Mission preserves serialized public HTML and orders native beacon before footer', async () => {
  const home = await readFile('space/ekodimission.page', 'utf8');
  const shell = await readFile('space/ekodimission-shell.js', 'utf8');
  assert.match(home, /<html lang="ko">/);
  assert.doesNotMatch(home, /data-ekodi-shell-surface="public"/);
  assert.match(shell, /function mountNativeFooterTraffic\(\)/);
  assert.match(shell, /dataset\.ekodiShellSurface='public'/);
  assert.match(shell, /beacon\.src='https:\/\/ekodi\.kr\/shell\/native-visit-beacon\.js'/);
  assert.match(shell, /beacon\.async=false/);
  assert.match(shell, /script\.src='https:\/\/ekodi\.kr\/shell\/user-ui-footer\.js'/);
  assert.match(shell, /script\.async=false/);
  assert.ok(shell.indexOf('document.head.append(beacon)') < shell.indexOf('document.head.append(script)'));
});

test('CGMA gateway injects public-only scripts and is safe under Node unit tests', async () => {
  const source = await readFile('platform-router-entry-worker.js', 'utf8');
  assert.match(source, /function injectCgmaFooterTraffic\(response, request\)/);
  assert.match(source, /response\.status!==200/);
  assert.match(source, /typeof HTMLRewriter==='undefined'/);
  assert.match(source, /setAttribute\('data-ekodi-shell-surface','public'\)/);
  assert.match(source, /native-visit-beacon\.js/);
  assert.match(source, /user-ui-footer\.js/);
  assert.match(source, /injectCgmaFooterTraffic\(await cgmaPublicPassthrough\(request,fetchImpl\),request\)/);
  assert.match(source, /injectCgmaFooterTraffic\(injectCgmaRegionalLinks\(/);
  assert.match(source, /\(\?:admin\|auth\|api\)/);
});

test('read-only footer and separate native beacon honor privacy, attribution and deduplication', async () => {
  const footer = await readFile('shell/user-ui-footer.js', 'utf8');
  const beacon = await readFile('shell/native-visit-beacon.js', 'utf8');
  const backend = await readFile('traffic-intelligence-control.js', 'utf8');
  assert.match(footer, /attachFooterTraffic\(nativeFooter\(\)\)/);
  assert.match(footer, /ekodi:footer-traffic-ready/);
  assert.doesNotMatch(footer, /sendBeacon|method:'POST'/);
  assert.match(beacon, /window\.__EKODI_SHELL_BOOTED/);
  assert.match(beacon, /navigator\.globalPrivacyControl===true\|\|navigator\.doNotTrack==='1'/);
  assert.match(beacon, /sent\.has\(key\)/);
  assert.match(beacon, /navigator\.sendBeacon/);
  assert.match(beacon, /api\/telemetry\/visit/);
  assert.doesNotMatch(beacon, /cf-connecting-ip|x-forwarded-for|navigator\.userAgent/);
  assert.match(footer, /if\(node\.dataset\.ekodiTrafficScope===scope\)return/);
  assert.match(backend, /count > 0 && count < 5/);
  assert.match(backend, /anonymous_browser_sessions/);
});
