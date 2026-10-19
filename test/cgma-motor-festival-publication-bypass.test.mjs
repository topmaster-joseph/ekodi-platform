import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../platform-router-entry-worker.js';

// Production state (2026-10-20): the CGMA Shared Site publication control is 'maintenance' because the tenant
// home is served by the CGMA gateway/Pages. The festival intake must still answer with its own route.
const files={
  '/cgma/motor-festival-2026/':['prototypes/cgma-motor-festival-2026.html','text/html; charset=utf-8'],
  '/cgma/motor-festival-2026/app.js':['prototypes/cgma-motor-festival-2026.js','text/javascript'],
  '/cgma/motor-festival-2026/admin/':['prototypes/cgma-motor-festival-2026-admin.html','text/html; charset=utf-8'],
};
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const maintenanceRow={site_id:'cgma',workspace_id:'cgma',domain:'',public_status:'maintenance',maintenance_display_type:'default',
  maintenance_redirect_url:'',maintenance_title:'점검 중',maintenance_message:'점검 중입니다',redirect_mode:'button',updated_at:'2026-09-04T03:00:34.443Z'};
function statement(sql){
  const self={bind(){return self},async first(){return /public_site_controls/i.test(sql)?maintenanceRow:null},
    async all(){return {results:[]}},async run(){return {success:true}}};
  return self;
}
const env={ASSETS:{async fetch(request){
  const hit=files[new URL(request.url).pathname];
  return hit?new Response(read(hit[0]),{headers:{'content-type':hit[1]}}):new Response('Not Found',{status:404});
}},DB:{prepare:statement},ENVIRONMENT:'test'};
const ctx={waitUntil(){},passThroughOnException(){}};
const get=path=>worker.fetch(new Request('https://ekodi.kr'+path,{headers:{'user-agent':'test','cf-connecting-ip':'203.0.113.9',accept:'text/html'}}),env,ctx);

test('CGMA maintenance status page still applies to other Shared Site cgma pages (control check)',async()=>{
  const r=await get('/cgma/some-public-page/');
  assert.equal(r.headers.get('x-ekodi-site-publication'),'maintenance');
});
test('festival documents bypass the CGMA publication status page and keep their route identity',async()=>{
  for(const [path,marker] of [['/cgma/motor-festival-2026/','id="apply"'],['/cgma/motor-festival-2026/admin/','id="refresh"']]){
    const r=await get(path);
    assert.equal(r.status,200,path);
    assert.equal(r.headers.get('x-ekodi-route'),'cgma-motor-festival-2026',path);
    assert.equal(r.headers.get('x-ekodi-site-publication'),null,path);
    assert.ok((await r.text()).includes(marker),path);
  }
});
test('festival script and unknown festival paths keep the route policy',async()=>{
  const js=await get('/cgma/motor-festival-2026/app.js');
  assert.equal(js.status,200);assert.equal(js.headers.get('x-ekodi-route'),'cgma-motor-festival-2026');
  const missing=await get('/cgma/motor-festival-2026/nope/');
  assert.equal(missing.status,404);assert.equal(missing.headers.get('x-ekodi-route'),'cgma-motor-festival-2026');
});
