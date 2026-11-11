import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=async(path)=>readFile(new URL(path,root),'utf8');
test('fleet is guarded by platform super admin and ai:read',async()=>{
 const src=await read('ai-command-control.js');
 const start=src.indexOf('// Super-admin-only read of site improvement history');
 const end=src.indexOf('// EKODI site-AI advisory-only intent preview',start);
 assert.ok(start>0&&end>start);
 const route=src.slice(start,end);
 assert.match(route,/requirePlatformSuperAdmin\('ai:read'\)/);
 assert.match(route,/request\.method !== 'GET'/);
 assert.match(route,/readSiteAiFleet\(env, siteAiLifecycleRegistry\)/);
 assert.doesNotMatch(route,/approveOrchestratorTask|submitOrchestratorTask|runEkodiCommandQueue/);
});
test('Agents UI includes safe site fleet and user-visible unavailable states',async()=>{
 const [html,js]=await Promise.all([read('control.html'),read('control.js')]);
 assert.match(html,/id="siteAiFleetCards"/);
 assert.match(html,/id="siteAiFleetSummary"/);
 assert.match(js,/refreshSiteAiFleet\(\)/);
 assert.match(js,/if\(view==='agents'\)void refreshSiteAiFleet\(\)/);
 assert.match(js,/integration!=='observation_only'/);
 assert.match(js,/AI 가동 미검증/);
 assert.match(js,/document\.createElement\('a'\)/);
 assert.match(js,/link\.href=path/);
});
