import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeTask } from '../scripts/ekodi-background-browser-worker.mjs';

const source=fs.readFileSync(new URL('../scripts/ekodi-background-browser-worker.mjs',import.meta.url),'utf8');
const policy=JSON.parse(fs.readFileSync(new URL('../config/background-browser-worker-policy.json',import.meta.url),'utf8'));

test('EKODI background browser policy is native, canonical-origin and isolated',()=>{
  assert.equal(policy.policyId,'EKODI-BROWSER-WORKER-001');
  assert.equal(policy.owner,'ekodi-orchestrator');
  assert.equal(policy.canonicalOrigin,'https://ekodi.kr');
  assert.equal(policy.originPolicy.canonicalOriginOnly,true);
  assert.equal(policy.isolation.ephemeralBrowserContextRequired,true);
  assert.equal(policy.isolation.activeUserProfileReuseForbidden,true);
  assert.equal(policy.networkSafety.mutationGrantDefault,false);
  assert.equal(policy.provider.externalBrowserServiceRequired,false);
});

test('task protocol rejects external origins and raw execution surfaces',()=>{
  assert.throws(()=>normalizeTask({path:'https://example.com/'}),/canonical ekodi\.kr/);
  assert.throws(()=>normalizeTask({actions:[{type:'evaluate',code:'1+1'}]}),/Unsupported browser action/);
  assert.throws(()=>normalizeTask({actions:[{type:'press',selector:'body',key:'Control+A'}]}),/Unsupported key/);
  const task=normalizeTask({path:'/admin/',deviceProfile:'mobile-portrait',actions:[
    {type:'click',selector:'button[data-test="open"]'},
    {type:'fill',selector:'input[name="q"]',value:'hello'},
    {type:'snapshot'},
  ]});
  assert.equal(task.path,'/admin/');
  assert.equal(task.allowMutation,false);
  assert.equal(task.actions.length,3);
});

test('worker uses Playwright isolated context without arbitrary JS task execution or host input',()=>{
  assert.match(source,/await import\('playwright'\)/);
  assert.match(source,/chromium\.launch\(\{headless:true\}\)/);
  assert.match(source,/browser\.newContext/);
  assert.match(source,/acceptDownloads:false/);
  assert.match(source,/block-non-idempotent-http|blockedMutations/);
  assert.doesNotMatch(source,/child_process|exec\(|spawn\(|powershell|cmd\.exe|SendKeys|SetCursorPos/);
  assert.doesNotMatch(source,/item\.code|action\.code|rawJavascript/);
});
