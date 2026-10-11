import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedTarget, browserCandidates, probeCdp, attemptNativeCanaryBrowsers, installedCanaryBrowsers } from '../tools/ekodi-device-agent/windows/ekodi-native-browser-cdp.mjs';

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

test('two bounded trials fail closed on Chrome then accept genuine Edge DOM proof', async () => {
  const attempts=[];
  const expected={ok:true,mode:'native-cdp',url:'https://ekodi.kr/',domBytes:240};
  const actual=await attemptNativeCanaryBrowsers({
    browsers:['chrome.exe','msedge.exe'],timeoutMs:12000,
    probe:async({browser,timeoutMs})=>{
      attempts.push({browser,timeoutMs});
      if(browser==='chrome.exe')throw new Error('CDP_PORT_TIMEOUT');
      return expected;
    }
  });
  assert.deepEqual(actual,expected);
  assert.deepEqual(attempts,[
    {browser:'chrome.exe',timeoutMs:12000},
    {browser:'msedge.exe',timeoutMs:12000}
  ]);
});
test('no browser, or both unsuccessful, cannot produce successful receipt', async () => {
  await assert.rejects(()=>attemptNativeCanaryBrowsers({browsers:[]}),/CDP_BROWSER_NOT_FOUND/);
  let calls=0;
  await assert.rejects(()=>attemptNativeCanaryBrowsers({
    browsers:['chrome.exe','msedge.exe','third.exe'],
    probe:async()=>{calls++;throw Error('CDP_DOM_EVIDENCE_MISSING');}
  }),/CDP_DOM_EVIDENCE_MISSING/);
  assert.equal(calls,2);
});
test('browser selection never repeats a browser family and omits unavailable paths', async () => {
  const available=await installedCanaryBrowsers(['/never/chrome.exe','/never/msedge.exe']);
  assert.deepEqual(available,[]);
});
test('one-shot CLI uses a bounded watchdog and exits explicitly after serializing receipt', async () => {
  const {readFileSync}=await import('node:fs');
  const source=readFileSync(new URL('../tools/ekodi-device-agent/windows/ekodi-native-browser-cdp.mjs',import.meta.url),'utf8');
  assert.match(source,/CDP_WORKER_WATCHDOG_TIMEOUT/);
  assert.match(source,/setTimeout\(\(\)=>complete\([^\n]+31000\)/);
  assert.match(source,/stream\.write\(JSON\.stringify\(output\)/);
  assert.match(source,/process\.exit\(failed\?1:0\)/);
  assert.match(source,/timeoutMs:12000/);
});
