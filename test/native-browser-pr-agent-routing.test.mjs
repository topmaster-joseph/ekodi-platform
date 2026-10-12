import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const control=readFileSync('device-control.js','utf8');
const agent=readFileSync('tools/ekodi-device-agent/windows/ekodi-device-agent.ps1','utf8');

test('first-party GitHub observation uses existing protected command capability',()=>{
  assert.match(control, /'computer\.browser\.pr\.observe':\s*\{\s*risk:\s*'maintain',\s*confirm:\s*true,\s*payload:\s*'github-pr-readonly'\s*\}/);
  assert.match(control, /'computer\.browser\.pr\.observe':\s*'backgroundBrowser'/);
  assert.match(control, /policy\.payload === 'github-pr-readonly'/);
  assert.match(control, /BROWSER_GITHUB_PR_INVALID/);
  assert.match(control, /String\(rawPr\)!==String\(n\)/);
  for(const contract of [
    "executionMode:'background-only'","createUserBrowserTab:false",
    "closeOwnedSurfaceOnComplete:true","closeOwnedSurfaceOnAuthRequired:true",
    "preserveUserOwnedSurfaces:true","mutationMode:'read-only'","loginMode:'never'",
  ])assert.ok(control.includes(contract),contract);
});

test('Windows Agent refuses unverified browser, login and mutations',()=>{
  assert.match(agent, /function Invoke-EkodiOwnedGithubPrObserve\(\$Payload\)/);
  assert.match(agent, /'computer\.browser\.pr\.observe'\s*\{\s*return Invoke-EkodiOwnedGithubPrObserve \$payload\s*\}/);
  const start=agent.indexOf('function Invoke-EkodiOwnedGithubPrObserve(');
  const end=agent.indexOf('function Invoke-BackgroundBrowserWorker(',start);
  assert.ok(start>=0&&end>start,'GitHub PR worker must be separate from legacy site browser worker');
  const worker=agent.slice(start,end);
  for(const value of [
    'Get-BackgroundBrowserCanaryState',
    "'background_browser_canary_required'",
    "'background-only'","'read-only'","'never'",
    "'^[1-9]\\d{0,5}$'",
    "'github_browser_node_22_required'",
    'c89617811c25c5cb3755252850f55298df3aed2c',
    "'allowedSubresourceUrl'",
    'WaitForExit(35000)',
    '$proof.existingProfileReused -ne $false',
    '$proof.foregroundInput -ne $false',
    '$proof.mutationsAllowed -ne $false',
    '$proof.domObserved -ne $true',
    '$proof.authRequired -ne $false',
    '$proof.httpStatus -ge 400',
  ])assert.ok(worker.includes(value),value);
  assert.doesNotMatch(worker,/--no-sandbox|document\.cookie|--remote-debugging-address=0\.0\.0\.0/);
  assert.doesNotMatch(worker, /desktopcommander|Invoke-Expression/i);
});

test('central GitHub PR observation request does not accept arbitrary web target or credentials',()=>{
  const pos=control.indexOf("if (policy.payload === 'github-pr-readonly')");
  const end=control.indexOf("if (policy.payload === 'camera-stream')",pos);
  assert.ok(pos>=0&&end>pos);
  const src=control.slice(pos,end);
  assert.doesNotMatch(src, /rawPayload\?\.(url|hostname|token|cookie|password|script)/);
  assert.match(src,/Number\.isSafeInteger\(n\)/);
  assert.match(src,/n<1\|\|n>999999/);
  assert.ok(src.includes("mutationMode:'read-only'"));
});
