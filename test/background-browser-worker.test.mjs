import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeTask } from '../scripts/ekodi-background-browser-worker.mjs';

const source=fs.readFileSync(new URL('../scripts/ekodi-background-browser-worker.mjs',import.meta.url),'utf8');
const policy=JSON.parse(fs.readFileSync(new URL('../config/background-browser-worker-policy.json',import.meta.url),'utf8'));
const workerWorkflow=fs.readFileSync(new URL('../.github/workflows/ekodi-background-browser-worker.yml',import.meta.url),'utf8');
const sharedRelease=fs.readFileSync(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');

test('EKODI background browser policy is native, canonical-origin and isolated',()=>{
  assert.equal(policy.policyId,'EKODI-BROWSER-WORKER-001');
  assert.equal(policy.owner,'ekodi-orchestrator');
  assert.equal(policy.canonicalOrigin,'https://ekodi.kr');
  assert.equal(policy.originPolicy.canonicalOriginOnly,true);
  assert.equal(policy.isolation.ephemeralBrowserContextRequired,true);
  assert.equal(policy.isolation.activeUserProfileReuseForbidden,true);
  assert.equal(policy.networkSafety.mutationGrantDefault,false);
  assert.equal(policy.provider.externalBrowserServiceRequired,false);
  assert.equal(policy.routingPolicy,'config/virtualization-routing-policy.json');
  assert.equal(policy.provider.externalFallbackForThisWorker,'forbidden-while-runtime-healthy');
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
  assert.match(source,/routingPolicy:'EKODI-VIRTUALIZATION-ROUTING-001'/);
  assert.match(source,/virtualizationProvider:'ekodi-background-browser-worker'/);
  assert.match(source,/virtualizationProviderType:'native'/);
  assert.match(source,/acceptDownloads:false/);
  assert.match(source,/userAiEntryCount:document\.querySelectorAll/);
  assert.match(source,/pageErrors\.push\(\{/);
  assert.match(source,/stack:clean\(err\?\.stack/);
  assert.match(source,/block-non-idempotent-http|blockedMutations/);
  assert.doesNotMatch(source,/child_process|exec\(|spawn\(|powershell|cmd\.exe|SendKeys|SetCursorPos/);
  assert.doesNotMatch(source,/item\.code|action\.code|rawJavascript/);
});


test('shared-site guarded release invokes native browser verification after production deploy',()=>{
  assert.match(workerWorkflow,/workflow_call:/);
  assert.match(workerWorkflow,/surface_path:/);
  assert.match(workerWorkflow,/surface_paths:/);
  assert.match(workerWorkflow,/INPUT_PATHS/);
  assert.match(workerWorkflow,/horizontalOverflow/);
  assert.match(workerWorkflow,/userAiEntryCount/);
  assert.match(workerWorkflow,/test\("\/admin\(\?:\/\|\$\)"/);
  assert.match(workerWorkflow,/\.pageErrors \| length == 0/);
  assert.match(workerWorkflow,/uses:\s*actions\/upload-artifact@v4\n\s*if:\s*always\(\)/);
  assert.match(workerWorkflow,/device_profile:/);
  assert.match(workerWorkflow,/group:\s*ekodi-background-browser-worker-\$\{\{ github\.ref \}\}-\$\{\{ inputs\.device_profile \|\| 'desktop' \}\}/);
  assert.match(sharedRelease,/native_surface_verification_desktop:/);
  assert.match(sharedRelease,/native_surface_verification_mobile:/);
  assert.match(sharedRelease,/uses:\s*\.\/\.github\/workflows\/ekodi-background-browser-worker\.yml/);
  assert.match(sharedRelease,/device_profile:\s*desktop/);
  assert.match(sharedRelease,/device_profile:\s*mobile-portrait/);
  assert.match(sharedRelease,/surface_paths:\s*\/,\/my\/,\/admin\/,\/ekodimall\/admin/);
  assert.match(sharedRelease,/authenticated_admin_surface_verification:/);
  assert.match(sharedRelease,/verify-admin-production-ui-e2e\.yml/);
  const desktop=sharedRelease.match(/native_surface_verification_desktop:[\s\S]*?(?=\n\s{2}[a-zA-Z0-9_-]+:|$)/)?.[0]||'';
  const mobile=sharedRelease.match(/native_surface_verification_mobile:[\s\S]*?(?=\n\s{2}[a-zA-Z0-9_-]+:|$)/)?.[0]||'';
  assert.match(desktop,/needs:\s*deploy/);
  assert.match(mobile,/needs:\s*deploy/);
});
