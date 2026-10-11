import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import site from '../site-worker.js';

const html='<!doctype html><html><head><title>EKODI Control</title></head><body><form id="commandForm"><input aria-label="명령"/></form></body></html>';
function envWithAssets(){
  const paths=[];
  const env={ASSETS:{async fetch(request){const path=new URL(request.url).pathname;paths.push(path);return new Response(path==='/control'?html:'asset',{status:200,headers:{'content-type':path==='/control'?'text/html':'text/plain'}})}}};
  return {env,paths};
}
for(const path of ['/admin/control','/admin/control/']){
  test('standalone admin Control serves the same page at '+path,async()=>{
    const {env,paths}=envWithAssets();
    const r=await site.fetch(new Request('https://ekodi.kr'+path),env);
    assert.equal(r.status,200);
    assert.equal(r.headers.get('x-ekodi-route'),'control-surface');
    assert.equal(r.headers.get('cache-control'),'no-store');
    assert.match(r.headers.get('x-robots-tag')||'',/noindex/);
    assert.match(await r.text(),/id="commandForm"/);
    assert.deepEqual(paths,['/control'],'dedicated Control asset, not generic admin shell');
  });
}
for(const path of ['/control','/control/']){
  test('legacy Control redirects to admin canonical without losing query at '+path,async()=>{
    const {env,paths}=envWithAssets();
    const r=await site.fetch(new Request('https://ekodi.kr'+path+'?test=one'),env);
    assert.equal(r.status,308);
    assert.equal(r.headers.get('location'),'https://ekodi.kr/admin/control?test=one');
    assert.equal(r.headers.get('x-ekodi-route'),'control-canonical-redirect');
    assert.deepEqual(paths,[]);
  });
}

test('guarded release manifest verifies the admin canonical and both legacy redirects',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const requests=manifest.worker.requests;
  const byPath=path=>requests.find(x=>new URL(x.url).pathname===path&&new URL(x.url).hostname==='ekodi.kr');
  assert.deepEqual(byPath('/admin/control').statuses,[200]);
  assert.deepEqual(byPath('/admin/control/').statuses,[200]);
  for(const path of ['/control','/control/']){
    const rule=byPath(path);
    assert.deepEqual(rule.statuses,[308]);
    assert.ok(rule.headerExpect.includes('location: https://ekodi.kr/admin/control'));
  }
});

test('Control asset requests still work on existing absolute paths',async()=>{
  const {env,paths}=envWithAssets();
  const r=await site.fetch(new Request('https://ekodi.kr/control.js'),env);
  assert.equal(r.status,200);
  assert.equal(r.headers.get('x-ekodi-route'),'control-asset');
  assert.deepEqual(paths,['/control.js']);
});
