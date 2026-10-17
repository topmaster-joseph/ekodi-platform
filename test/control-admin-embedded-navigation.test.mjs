import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=async file=>readFile(new URL('../'+file,import.meta.url),'utf8');

test('admin embed reuses native Control work tabs without a duplicate global sidebar', async()=>{
 const [js,css,html]=await Promise.all(['control.js','control.css','control.html'].map(read));
 assert.match(js,/dataset\.ekodiControlEmbedded!=='admin'/);
 assert.match(js,/function mountEmbeddedToolbar\(\)/);
 assert.match(js,/strip\.append\(create,nav,history\)/);
 assert.match(js,/top\.after\(strip\)/);
 assert.match(js,/rail\.hidden=true/);
 assert.match(js,/mountEmbeddedToolbar\(\);\s*bind\(\)/);
 assert.match(css,/\.control-rail\[hidden\]/);
 assert.match(css,/display:none!important/);
 assert.match(css,/\.control-main\{\s*width:100%!important;\s*margin:0!important/);
 assert.match(css,/\.composer-wrap\{\s*left:0!important/);
 assert.match(css,/\.control-embedded-history/);
 assert.match(css,/\.control-embedded-history:not\(\[open\]\) \.recent\{\s*display:none!important/);
 assert.match(css,/height:calc\(100svh - 120px\)!important/);
 assert.match(css,/height:calc\(100svh - 106px\)!important/);
 assert.match(html,/id="newTask"/);
 for(const view of ['chat','tasks','agents','workers','results']){
   assert.match(html,new RegExp('data-view="'+view+'"'));
 }
 assert.match(html,/id="recentTasks"/);
});

test('block notice is transparent; never auto approves or claims release',async()=>{
 const s=await read('control.js');
 assert.match(s,/submitted\.humanGate\?\.required===true/);
 assert.match(s,/Human Gate 승인 대기/);
 assert.match(s,/승인 없이 배포하지 않습니다/);
 assert.match(s,/state\.tasks\.unshift/);
 assert.doesNotMatch(s,/fetch\([^\n]*\/approve/);
});

test('production verifiers require embedded toolbar while standalone jitter retains its original rail',async()=>{
 const files=['scripts/admin-assist-canonical-e2e.mjs','scripts/admin-authenticated-e2e-menu-worker.mjs','scripts/verify-admin-production-ui-e2e.mjs'];
 for(const path of files){
   const s=await read(path);
   assert.match(s,/#controlEmbeddedToolbar/,path);
 }
 const native=await read('scripts/verify-control-jitter-native.mjs');
 assert.match(native,/rail:'#controlRail'/);
});
