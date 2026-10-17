import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {routeCanonicalSurface} from '../canonical-surface-router.js';
import siteWorker from '../site-worker.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const control='<!doctype html><html lang="ko" data-ekodi-control="v2"><title>EKODI Control</title><body>무엇을 수행할까요?</body></html>';

test('canonical /admin/control does not route to generic /admin shell',async()=>{
 const calls=[];
 const legacyFetch=async request=>{calls.push(new URL(request.url).pathname);return new Response(control,{headers:{'content-type':'text/html','cache-control':'no-store'}})};
 const res=await routeCanonicalSurface(new Request('https://ekodi.kr/admin/control?from=control'),{}, {legacyFetch});
 assert.equal(res.status,200);
 assert.deepEqual(calls,['/control']);
 assert.equal(res.headers.get('x-ekodi-route'),'control-surface');
 assert.equal(res.headers.get('x-ekodi-canonical-surface'),'control');
 assert.equal(res.headers.get('x-ekodi-canonical-path'),'/admin/control');
 assert.equal(res.headers.get('cache-control'),'no-store');
 assert.match(res.headers.get('x-robots-tag'),/noindex/);
 assert.match(await res.text(),/data-ekodi-control="v2"/);
});

test('Control trailing slash preserves query; illegal document writes are rejected',async()=>{
 const fail=async()=>{throw new Error('Unexpected upstream call')};
 const redirect=await routeCanonicalSurface(new Request('https://ekodi.kr/admin/control/?task=123'),{}, {legacyFetch:fail});
 assert.equal(redirect.status,308);
 assert.equal(redirect.headers.get('location'),'https://ekodi.kr/admin/control?task=123');
 const post=await routeCanonicalSurface(new Request('https://ekodi.kr/admin/control',{method:'POST'}),{}, {legacyFetch:fail});
 assert.equal(post.status,405);
 assert.equal(post.headers.get('allow'),'GET, HEAD');
});

test('standalone canonical Control and legacy /control both retain CSP and noindex',async()=>{
 const requests=[];
 const env={ASSETS:{fetch:async request=>{requests.push(new URL(request.url).pathname);return new Response(control,{headers:{'content-type':'text/html'}})}}};
 for(const path of ['/control','/admin/control']){
  const res=await siteWorker.fetch(new Request('https://ekodi.kr'+path),env,{});
  assert.equal(res.status,200,path);
  assert.equal(res.headers.get('x-ekodi-route'),'control-surface',path);
  assert.equal(res.headers.get('cache-control'),'no-store',path);
  assert.match(res.headers.get('x-robots-tag'),/noindex/,path);
  assert.match(res.headers.get('content-security-policy'),/frame-ancestors 'none'/,path);
  assert.match(await res.text(),/EKODI Control/,path);
 }
 assert.ok(requests.every(path=>path==='/control'||path==='/control.html'));
 const iframe=await siteWorker.fetch(new Request('https://ekodi.kr/admin/control?embedded=admin'),env,{});
 assert.equal(iframe.headers.get('x-frame-options'),'SAMEORIGIN');
 assert.match(iframe.headers.get('content-security-policy'),/frame-ancestors 'self'/);
});

test('existing approved single-sidebar Admin workbench and task history remain unchanged',()=>{
 const home=read('admin-control-home.js'),nav=read('control.js'),style=read('control.css'),html=read('control.html');
 assert.match(home,/frame\.src='\/control\?embedded=admin'/);
 assert.match(nav,/function mountEmbeddedToolbar\(\)/);
 assert.match(nav,/rail\.hidden=true/);
 assert.match(style,/\.control-embedded-toolbar/);
 assert.match(style,/\.control-rail\[hidden\]/);
 assert.match(nav,/HISTORY_KEY='ekodi-admin-command-history-v1'/);
 assert.match(nav,/CONTROL_STATE='ekodi-control-state-v1'/);
 assert.match(nav,/TOKEN_KEY='ekodi-auth-token'/);
 assert.match(nav,/pathname:location\.pathname/);
 assert.match(html,/href="\/admin\/control"/);
 assert.match(html,/src="\/control\.js/);
 assert.match(html,/href="\/control\.css/);
});

test('guarded site production manifest tests new Control URL and keeps old URLs',()=>{
 const manifest=JSON.parse(read('deploy/manifests/shared-site.worker.json'));
 const entries=manifest.worker.requests;
 const canonical=entries.find(x=>x.url==='https://ekodi.kr/admin/control');
 assert.ok(canonical);
 assert.ok(canonical.headerExpect.includes('x-ekodi-canonical-path: /admin/control'));
 assert.ok(entries.some(x=>x.url==='https://ekodi.kr/control'));
 assert.ok(entries.some(x=>x.url==='https://ekodi.kr/control.css'));
 assert.ok(entries.some(x=>x.url==='https://ekodi.kr/control.js'));
});
