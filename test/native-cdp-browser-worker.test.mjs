import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedTarget, browserCandidates, probeCdp } from '../tools/ekodi-device-agent/windows/ekodi-native-browser-cdp.mjs';

test('native CDP canary only accepts canonical HTTPS EKODI', () => {
  assert.equal(allowedTarget('https://ekodi.kr/'), true);
  assert.equal(allowedTarget('https://ekodi.kr/admin/devices-agent/devices'), true);
  for (const value of ['http://ekodi.kr/', 'https://evil.example/', 'https://ekodi.kr.evil.example/', 'https://user:pass@ekodi.kr/', 'file:///C:/', 'https://127.0.0.1/']) {
    assert.equal(allowedTarget(value), false, value);
  }
});
test('browser lookup supports Windows Chrome and Edge locations without external providers', () => {
  const files=browserCandidates({ProgramFiles:'C:\\Apps','ProgramFiles(x86)':'C:\\Apps86',LOCALAPPDATA:'C:\\Local'});
  assert.equal(files.length,6);
  assert(files.some(p=>p.endsWith('chrome.exe')));
  assert(files.some(p=>p.endsWith('msedge.exe')));
});
test('native CDP canary refuses unsafe targets before launching a browser', async () => {
  await assert.rejects(()=>probeCdp({browser:'missing.exe',url:'https://evil.example/'}),/CDP_TARGET_FORBIDDEN/);
  await assert.rejects(()=>probeCdp({url:'https://ekodi.kr/'}),/CDP_BROWSER_REQUIRED/);
  await assert.rejects(()=>probeCdp({browser:'missing.exe',timeoutMs:0}),/CDP_TIMEOUT_INVALID/);
});
test('CDP canary does not equate browser exit zero to successful page verification', async () => {
  await assert.rejects(()=>probeCdp({browser:'this-browser-does-not-exist.exe',timeoutMs:1200}),/CDP_BROWSER_/);
});
