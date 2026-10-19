import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isCgmaMotorFestivalPath, routeCgmaMotorFestival } from '../cgma-motor-festival-route.js';

const base='https://ekodi.kr/cgma/motor-festival-2026';
const files={
  '/cgma/motor-festival-2026/':['prototypes/cgma-motor-festival-2026.html','text/html; charset=utf-8'],
  '/cgma/motor-festival-2026/app.js':['prototypes/cgma-motor-festival-2026.js','text/javascript'],
  '/cgma/motor-festival-2026/admin/':['prototypes/cgma-motor-festival-2026-admin.html','text/html; charset=utf-8'],
  '/cgma/motor-festival-2026/admin/app.js':['prototypes/cgma-motor-festival-2026-admin.js','text/javascript'],
};
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const env={ASSETS:{async fetch(request){
  const hit=files[new URL(request.url).pathname];
  return hit?new Response(read(hit[0]),{headers:{'content-type':hit[1]}}):new Response('Not Found',{status:404});
}}};

test('path matcher is limited to the festival subtree',()=>{
  assert.equal(isCgmaMotorFestivalPath('/cgma/motor-festival-2026'),true);
  assert.equal(isCgmaMotorFestivalPath('/cgma/motor-festival-2026/admin/'),true);
  assert.equal(isCgmaMotorFestivalPath('/cgma/motor-festival-2026x'),false);
  assert.equal(isCgmaMotorFestivalPath('/cgma/admin'),false);
});
test('canonical slash redirects for public and admin pages',async()=>{
  for(const [from,to] of [['',base+'/'],['/admin',base+'/admin/'],['/index.html',base+'/']]){
    const r=await routeCgmaMotorFestival(new Request(base+from),env);
    assert.equal(r.status,308);assert.equal(r.headers.get('location'),to);
  }
});
test('documents carry strict CSP, no-store and workspace identity',async()=>{
  for(const path of ['/','/admin/']){
    const r=await routeCgmaMotorFestival(new Request(base+path),env);
    assert.equal(r.status,200);
    assert.equal(r.headers.get('cache-control'),'no-store');
    assert.equal(r.headers.get('x-ekodi-workspace'),'cgma');
    const csp=r.headers.get('content-security-policy');
    assert.match(csp,/script-src 'self'/);assert.match(csp,/connect-src 'self'/);assert.match(csp,/frame-ancestors 'none'/);
    assert.doesNotMatch(csp,/script-src[^;]*unsafe-inline/);
  }
  assert.equal((await routeCgmaMotorFestival(new Request(base+'/admin/'),env)).headers.get('x-robots-tag'),'noindex, nofollow');
});
test('pages contain no inline script and call only the same-origin API',()=>{
  for(const p of ['prototypes/cgma-motor-festival-2026.html','prototypes/cgma-motor-festival-2026-admin.html']){
    const html=read(p);
    assert.doesNotMatch(html,/<script(?![^>]*\bsrc=)[^>]*>/);
    assert.doesNotMatch(html,/supabase|service_role|apikey/i);
  }
  for(const p of ['prototypes/cgma-motor-festival-2026.js','prototypes/cgma-motor-festival-2026-admin.js']){
    const js=read(p);
    assert.match(js,/'\/api\/merchant-events\/motor-festival-2026\/applications'/);
    assert.doesNotMatch(js,/https?:\/\//);
    assert.doesNotMatch(js,/innerHTML/);
  }
  const apply=read('prototypes/cgma-motor-festival-2026.js');
  assert.match(apply,/'x-ekodi-intake-request':'1'/);assert.match(apply,/'idempotency-key'/);
  assert.match(read('prototypes/cgma-motor-festival-2026.html'),/name="consent" required/);
  assert.match(read('prototypes/cgma-motor-festival-2026.html'),/name="website" tabindex="-1"/);
  const pattern=read('prototypes/cgma-motor-festival-2026.html').match(/name="phone"[^>]*pattern="([^"]+)"/)[1];
  assert.doesNotThrow(()=>new RegExp('^(?:'+pattern+')$','v'),'HTML pattern must compile with the v flag used by browsers');
  assert.ok(new RegExp('^(?:'+pattern+')$','v').test('010-1234-5678'));
});
test('unknown files, writes and missing assets fail closed',async()=>{
  assert.equal((await routeCgmaMotorFestival(new Request(base+'/data.json'),env)).status,404);
  assert.equal((await routeCgmaMotorFestival(new Request(base+'/',{method:'POST',body:'x'}),env)).status,405);
  assert.equal((await routeCgmaMotorFestival(new Request(base+'/'),{})).status,503);
});
test('Shared Site router and build publish the festival pages',()=>{
  const router=read('platform-router-entry-worker.js');
  assert.match(router,/isCgmaMotorFestivalPath\(url\.pathname\)\)return routeCgmaMotorFestival/);
  const build=read('scripts/build.mjs');
  assert.match(build,/cgma\/motor-festival-2026\/admin\/index\.html/);
});

test('browser revalidation (If-None-Match) still serves 200, never 503 (both CGMA routes)',async()=>{
  const {routeCgmaAiEducation}=await import('../cgma-ai-education-route.js');
  const strictAssets={ASSETS:{async fetch(request){
    if(request.headers.get('if-none-match')||request.headers.get('if-modified-since'))return new Response(null,{status:304});
    const p=new URL(request.url).pathname;
    const type=p.endsWith('.js')?'text/javascript':'text/html; charset=utf-8';
    return new Response('ok',{headers:{'content-type':type,etag:'"v1"'}});
  }}};
  const conditional=url=>new Request(url,{headers:{'if-none-match':'"v1"','if-modified-since':'Mon, 19 Oct 2026 00:00:00 GMT'}});
  for(const path of ['/','/app.js','/admin/','/admin/app.js']){
    assert.equal((await routeCgmaMotorFestival(conditional(base+path),strictAssets)).status,200,path);
  }
  for(const path of ['/cgma/ai-education/','/cgma/ai-education/app.js']){
    assert.equal((await routeCgmaAiEducation(conditional('https://ekodi.kr'+path),strictAssets)).status,200,path);
  }
});
