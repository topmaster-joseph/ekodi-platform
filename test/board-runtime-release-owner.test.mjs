import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [dispatcher,boardWorker,boardConfig,cgmaWorkflow,siteWorkflow]=await Promise.all([
 read('scripts/converge-orchestrated-pr-merge.mjs'),
 read('cgma-board-service-worker.js'),
 read('wrangler.cgma-board-internal.toml'),
 read('.github/workflows/deploy-cgma-apex-edge.yml'),
 read('.github/workflows/deploy-site-core.yml'),
]);

test('CGMA internal board runtime changes are owned by guarded CGMA Edge release',()=>{
 const start=dispatcher.indexOf('const cgmaApexTouched=');
 const end=dispatcher.indexOf('const independentBoardTouched=',start);
 assert.ok(start>=0&&end>start);
 const section=dispatcher.slice(start,end);
 for(const file of ['site-board-control.js','cgma-board-service-worker.js','wrangler.cgma-board-internal.toml',
   '.github/workflows/deploy-cgma-apex-edge.yml','scripts/converge-orchestrated-pr-merge.mjs']){
   assert.ok(section.includes("'"+file+"'"),'missing CGMA board owner: '+file);
 }
 assert.match(dispatcher,/if\(cgmaApexTouched\)\{/);
 assert.match(dispatcher,/actions\/workflows\/deploy-cgma-apex-edge\.yml\/dispatches/);
});

test('shared-board runtime also triggers protected Site Core release',()=>{
 const start=dispatcher.indexOf('const sharedSiteTouched=');
 const end=dispatcher.indexOf('async function dispatchPostMergeDeploys()',start);
 assert.ok(start>=0&&end>start);
 const section=dispatcher.slice(start,end);
 for(const file of ['site-board-control.js','common-board-adapter.js','cgma-board-service-worker.js']){
   assert.ok(section.includes("file==='"+file+"'"),'missing shared board owner '+file);
 }
 assert.match(dispatcher,/if\(sharedSiteTouched\)\{/);
 assert.match(dispatcher,/actions\/workflows\/deploy-site-core\.yml\/dispatches/);
 assert.ok(siteWorkflow.includes("'site-board-control.js'"));
});

test('CGMA internal board remains route-less and released only with official task receipt',()=>{
 assert.match(boardWorker,/import \{ handleSiteBoardRequest \} from '\.\/site-board-control\.js'/);
 assert.match(boardConfig,/main = "cgma-board-service-worker\.js"/);
 assert.match(boardConfig,/workers_dev = false/);
 assert.doesNotMatch(boardConfig,/\[\[routes\]\]/);
 assert.match(cgmaWorkflow,/release_branch_ref:/);
 assert.match(cgmaWorkflow,/release_task_id:/);
 assert.match(cgmaWorkflow,/wrangler\.cgma-board-internal\.toml/);
});

test('CGMA recovery deploys route-less internal board before the public edge gateway',()=>{
 const internal=cgmaWorkflow.indexOf('deploy --config .ekodi-control/wrangler.cgma-board-internal.toml');
 const gateway=cgmaWorkflow.indexOf('deploy --config wrangler.cgma-root-gateway.toml');
 assert.ok(internal>0,'CGMA internal board deploy step missing');
 assert.ok(gateway>internal,'public gateway cannot deploy before its verified board service');
 assert.match(cgmaWorkflow,/Verify CGMA edge production/);
});
