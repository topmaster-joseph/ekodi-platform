import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const convergence=read('scripts/converge-orchestrated-pr-merge.mjs');
const siteWorkflow=read('.github/workflows/deploy-site-core.yml');
const routeRegistry=read('platform-route-registry.js');

test('canonical route registry is an exact guarded Site Core release trigger',()=>{
 const start=convergence.indexOf('const sharedSiteTouched=');
 const end=convergence.indexOf('const churchPagesTouched=',start);
 assert.ok(start>=0 && end>start,'shared Site Core detection block is required');
 const predicate=convergence.slice(start,end);
 assert.ok(predicate.includes("file==='platform-route-registry.js'"),'route registry must be included in post-merge dispatch');
 assert.ok(siteWorkflow.includes("- 'platform-route-registry.js'"),'direct main-push fallback must also own the registry');
 assert.ok(convergence.includes('if(sharedSiteTouched){'),'guarded dispatch condition must remain enforced');
 assert.ok(convergence.includes("/actions/workflows/deploy-site-core.yml/dispatches"),'dispatch must use the protected Site Core pipeline');
 assert.ok(convergence.includes('release_branch_ref:branch,release_task_id:taskId'),'release must include authenticated orchestrator receipt');
});

test('research is routed through the existing Education Worker without adding a new service',()=>{
 assert.ok(routeRegistry.includes("prefix:'/research',binding:'EDUCATION',preservePrefix:true"));
 assert.ok(routeRegistry.includes("prefix:'/edu',binding:'EDUCATION'"));
 const manifest=read('ekodi-service-manifest.js');
 assert.ok(!manifest.includes("{id:'research',name:"));
});
