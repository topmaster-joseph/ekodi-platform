import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const admin = readFileSync(new URL('../hybrid-execution-admin.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../hybrid-execution.js', import.meta.url), 'utf8');
const fn = admin.match(/  function normalizeNativeBrowserPath\(input\) \{[\s\S]*?\n  \}/)?.[0];
assert.ok(fn, 'native browser job path validation must exist');
function normalize(input) {
  return vm.runInNewContext(
    `(() => { const API_BASE='https://ekodi.kr'; ${fn}; return normalizeNativeBrowserPath(${JSON.stringify(input)}); })()`,
    { URL },
  );
}

test('native execution accepts internal EKODI paths without requiring MCP', () => {
  assert.equal(normalize('/ai/'), '/ai/');
  assert.equal(normalize('/admin/services/common-services?service=ai'), '/admin/services/common-services?service=ai');
  assert.match(admin, /id="hybridNativeBrowserForm"/);
  assert.match(admin, /MCP 불필요/);
});

test('native execution rejects external, relative, tokenized or fragment-bearing URLs', () => {
  for (const bad of [
    'https://github.com/topmaster-joseph/ekodi-platform',
    '//evil.example/', 'javascript:alert(1)', 'ai/',
    '/admin?access_token=SECRET', '/admin?session_id=SECRET',
    '/admin?authorization=SECRET', '/admin#ekodi_admin_token=SECRET',
  ]) {
    assert.throws(() => normalize(bad), undefined, bad);
  }
});

test('native task uses existing authenticated hybrid queue with explicit confirmation', () => {
  assert.match(admin, /addEventListener\('submit', enqueueNativeBrowser\)/);
  assert.match(admin, /taskType:'computer\.browser\.execute'/);
  assert.match(admin, /maxAttempts:1, confirmed:true/);
  assert.match(admin, /request\('\/api\/control\/hybrid-execution\/jobs'/);
  assert.match(admin, /if \(!confirm\(/);
  assert.match(worker, /'computer\.browser\.execute': \{ capability:'backgroundBrowser'/);
  assert.match(worker, /if \(policy\.confirm && body\.confirmed !== true\)/);
  assert.match(worker, /target\.hostname!=='ekodi\.kr'/);
});

test('execution UI fails closed until online enabled canary-capable native worker is available', () => {
  assert.match(admin, /node\.online && node\.enabled && node\.autoExecute/);
  assert.match(admin, /node\.capabilities\?\.backgroundBrowser === true/);
  assert.match(admin, /button\.disabled = ready\.length === 0/);
  assert.match(admin, /renderNativeBrowserStatus\(\)/);
});
