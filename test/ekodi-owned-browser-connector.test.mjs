import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedDocumentUrl, normalizeConnectionRequest, safeEvidenceUrl,
  classifyPage, browserPaths, runBrowserConnection,
} from '../tools/ekodi-device-agent/windows/ekodi-owned-browser-connector.mjs';

test('only explicitly declared EKODI-owned browser connection modes are accepted', () => {
  assert.deepEqual(normalizeConnectionRequest({ mode: 'github-pr', pr: 4392 }), {
    mode: 'github-pr', pr: 4392,
    target: 'https://github.com/topmaster-joseph/ekodi-platform/pull/4392',
  });
  assert.equal(normalizeConnectionRequest({ mode: 'ekodi-site', path: '/singles' }).target,
    'https://ekodi.kr/singles');
  assert.equal(normalizeConnectionRequest({ mode: 'runtime-canary' }).target, 'about:blank');
  for (const bad of [{}, { mode: 'github-pr', pr: '../../settings' },
    { mode: 'github-pr', pr: 0 }, { mode: 'github-pr', pr: '01' },
    { mode: 'github-pr', pr: '4392?token=secret' },
    { mode: 'ekodi-site', path: '//evil.tld' },
    { mode: 'ekodi-site', path: '/login' },
    { mode: 'ekodi-site', path: '/singles?access_token=secret' },
    { mode: 'ekodi-site', path: 'https://github.com' },
    { mode: 'shell', command: 'whoami' }]) {
    assert.throws(() => normalizeConnectionRequest(bad), /BROWSER_/);
  }
});

test('browser documents remain within canonical site or owned GitHub repo', () => {
  assert.equal(allowedDocumentUrl('https://github.com/topmaster-joseph/ekodi-platform/pull/4392', 'github-pr'), true);
  assert.equal(allowedDocumentUrl('https://ekodi.kr/singles', 'ekodi-site'), true);
  assert.equal(allowedDocumentUrl('about:blank', 'runtime-canary'), true);
  for (const url of [
    'http://github.com/topmaster-joseph/ekodi-platform',
    'https://github.com.evil.tld/topmaster-joseph/ekodi-platform/pull/4392',
    'https://user:password@github.com/topmaster-joseph/ekodi-platform',
    'https://github.com/anotherorg/other/pull/1',
    'https://gist.github.com/topmaster-joseph/ekodi-platform',
    'file:///etc/passwd', 'http://127.0.0.1:9222/',
  ]) assert.equal(allowedDocumentUrl(url, 'github-pr'), false, url);
  assert.equal(allowedDocumentUrl('https://ekodi.kr/admin/control', 'ekodi-site'), true);
  assert.equal(allowedDocumentUrl('https://ekodi.kr.evil.tld/admin', 'ekodi-site'), false);
});

test('browser receipts never publish URL query credentials', () => {
  assert.equal(safeEvidenceUrl('https://github.com/topmaster-joseph/ekodi-platform/pull/4392?token=abc#frag'),
    'https://github.com/topmaster-joseph/ekodi-platform/pull/4392');
  const state = classifyPage({
    url: 'https://github.com/topmaster-joseph/ekodi-platform/pull/4392?token=abc',
    title: 'EKODI', heading: 'Release', status: 200,
  }, 'github-pr');
  assert.equal(state.ok, true);
  assert.equal(state.mutationsAllowed, false);
  assert.equal(state.existingProfileReused, false);
  assert.equal(state.foregroundInput, false);
  assert.equal(state.interactiveLoginOpened, false);
  assert.doesNotMatch(JSON.stringify(state), /token=abc/);
  assert.equal(classifyPage({ url: 'https://github.com/login' }, 'github-pr').outcome, 'AUTH_REQUIRED');
});

test('Windows browser candidates are dedicated executables; timeouts fail closed', async () => {
  const browsers = browserPaths({ ProgramFiles:'C:\\Program Files', 'ProgramFiles(x86)':'C:\\Program Files (x86)' }, 'win32');
  assert.ok(browsers.some(x => x.endsWith('msedge.exe')));
  assert.ok(browsers.some(x => x.endsWith('chrome.exe')));
  await assert.rejects(() => runBrowserConnection({ mode:'runtime-canary' }, { timeoutMs: 100 }), /BROWSER_TIMEOUT_INVALID/);
});
