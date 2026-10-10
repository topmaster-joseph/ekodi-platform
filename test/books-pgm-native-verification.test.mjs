import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeTask} from '../scripts/ekodi-background-browser-worker.mjs';

const root=new URL('../',import.meta.url);
const read=relative=>readFile(new URL(relative,root),'utf8');
const registry=JSON.parse(await read('config/books-pgm-native-verification.json'));
const workflow=await read('.github/workflows/ekodi-books-pgm-native-verification.yml');
const booksBatch=JSON.parse(await read('config/ekodibooks-native-verification.json'));
const pgmBatch=JSON.parse(await read('config/pgm-cgma-native-verification.json'));
const sharedWorkflow=await read('.github/workflows/ekodi-background-browser-worker.yml');
const router=await read('platform-router-entry-worker.js');

test('EKODI Books and PGM are the requested same-origin entrypoint baseline with bounded child paths',()=>{
 assert.equal(registry.policyId,'EKODI-BOOKS-PGM-NATIVE-VERIFY-001');
 assert.equal(registry.canonicalOrigin,'https://ekodi.kr');
 assert.equal(registry.readOnly,true);
 assert.equal(registry.maxPaths,12);
 assert.deepEqual(registry.devices,['desktop','mobile-portrait']);
 const entries=registry.surfaces.filter(e=>e.enabled!==false);
 assert.ok(entries.length<=registry.maxPaths);
 assert.equal(new Set(entries.map(e=>e.path)).size,entries.length);
 assert.equal(new Set(entries.map(e=>e.id)).size,entries.length);
 for(const e of entries){
   assert.equal(new URL(e.path,'https://ekodi.kr').origin,'https://ekodi.kr');
   assert.ok(e.path.startsWith('/')&&!e.path.startsWith('//'));
   if(e.expectedText)assert.ok(typeof e.expectedText==='string'&&e.expectedText.length<=500);
   assert.equal(normalizeTask({path:e.path,deviceProfile:'mobile-portrait',actions:[{type:'snapshot'}]}).allowMutation,false);
 }
 for(const path of ['/ekodibooks','/ekodibooks/series/','/ekodibooks/research/','/ekodibooks/notes/','/ekodibooks/ekodian/','/ekodibooks/admin/','/pgm','/pgm/#study','/pgm/#archive','/pgm/admin/','/cgma/board','/cgma/board/api/health']){
   assert.ok(entries.some(e=>e.path===path),path);
 }
});

test('legacy Books and PGM routes keep existing canonical and admin permission boundaries',()=>{
 assert.match(router,/legacySite=url\.pathname\.match/);
 assert.match(router,/legacy-service-canonical/);
 assert.match(router,/target\.pathname=.*pyeonggongmok/);
 assert.match(router,/handleSiteBoardRequest\(request,env\)/);
 assert.match(router,/routePyeonggongmokStatic\(request,env\)/);
});

test('all referenced child pages and PGM admin handoff exist in repository assets',async()=>{
 for(const path of ['index.html','series/index.html','research/index.html','notes/index.html','ekodian/index.html']){
   const source=await read('books/'+path);
   assert.match(source,/<title>/);
   assert.match(source,/<main id="main">/);
 }
 const home=await read('sites/pyeonggongmok/public/index.html');
 for(const id of ['study','archive','join'])assert.ok(home.includes('id="'+id+'"'),id);
 const admin=await read('sites/pyeonggongmok/public/admin/index.html');
 assert.match(admin,/https:\/\/ekodi\.kr\/admin\/\?route=workspace&source=pyeonggongmok/);
});

test('EKODI-owned native Chromium executor verifies child page text in isolated bounded device batches',()=>{
 assert.deepEqual([...booksBatch.surfaces,...pgmBatch.surfaces].map(e=>e.path),registry.surfaces.map(e=>e.path));
 for(const batch of [booksBatch,pgmBatch]){
   assert.equal(batch.maxPaths,6);
   assert.ok(batch.surfaces.length<=6);
   assert.equal(batch.readOnly,true);
 }
 for(const job of ['desktop-books','mobile-books','desktop-pgm-cgma','mobile-pgm-cgma'])assert.ok(workflow.includes('  '+job+':'),job);
 assert.match(workflow,/device_profile: desktop/);
 assert.match(workflow,/device_profile: mobile-portrait/);
 assert.equal((workflow.match(/uses: \.\/\.github\/workflows\/ekodi-background-browser-worker\.yml/g)||[]).length,4);
 assert.equal((workflow.match(/surface_registry: config\/ekodibooks-native-verification\.json/g)||[]).length,2);
 assert.equal((workflow.match(/surface_registry: config\/pgm-cgma-native-verification\.json/g)||[]).length,2);
 assert.equal((workflow.match(/surface_paths: \/ekodibooks/g)||[]).length,2);
 assert.equal((workflow.match(/surface_paths: \/pgm/g)||[]).length,2);
 assert.match(sharedWorkflow,/expectedTextByPath/);
 assert.match(sharedWorkflow,/actions\.push\(\{type:'assertText',text:expectedTextByPath\.get\(p\)\}\)/);
 assert.match(sharedWorkflow,/allowMutation:false/);
 assert.match(sharedWorkflow,/headless == true/);
 assert.match(sharedWorkflow,/ephemeralContext == true/);
 assert.match(sharedWorkflow,/inputs\.surface_registry \|\| inputs\.surface_paths \|\| inputs\.surface_path/);
});
