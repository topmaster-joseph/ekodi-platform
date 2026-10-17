import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {routeCanonicalSurface} from '../canonical-surface-router.js';
import siteWorker from '../site-worker.js';

const root=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const originalControl='<html data-ekodi-control="v2"><title>EKODI Control</title><body>무엇을 수행할까요?</body></html>';

test('canonical /admin/control returns the independent Control UI, not the generic Admin shell',async()=>{
 const upstream=[];
 const legacyFetch=async request=>{upstream.push(new URL(request.url).pathname);return new Response(originalControl,{headers:{'content-type':'text/html;charset=utf-8','x-ekodi-route':'control-surface','cache-control':'no-store'}})};
 const response=await routeCanonicalSurface(new Request('https://ekodi.kr/admin/control?session=1'),{}, {legacyFetch});
 assert.equal(response.status,200);
 assert.deepEqual(upstream,['/control']);
 assert.equal(response.headers.get('x-ekodi-canonical-surface'),'control');
 assert.equal(response.headers.get('x-ekodi-canonical-path'),'/admin/control');
 assert.equal(response.headers.get('x-ekodi-route'),'control-surface');
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.match(response.headers.get('x-robots-tag'),/noindex/);
 assert.match(await response.text(),/data-ekodi-control="v2"/);
});

test('trailing slash redirects to exact canonical Admin Control path with query intact',async()=>{
 const response=await routeCanonicalSurface(new Request('https://ekodi.kr/admin/control/?mode=tasks'),{}, {legacyFetch:async()=>{throw Error('redirect must happen first')}});
 assert.equal(response.status,308);
 assert.equal(response.headers.get('location'),'https://ekodi.kr/admin/control?mode=tasks');
});
test('Admin Control cannot execute protected mutations through the HTML surface',async()=>{
 const response=await routeCanonicalSurface(new Request('https://ekodi.kr/admin/control',{method:'POST'}),{}, {legacyFetch:async()=>{throw Error('must reject')}});
 assert.equal(response.status,405);
 assert.equal(response.headers.get('allow'),'GET, HEAD');
});

test('legacy standalone Control remains available through Site Core, with unchanged secure headers',async()=>{
 const assetCalls=[];
 const env={ASSETS:{fetch:async request=>{assetCalls.push(new URL(request.url).pathname);return new Response(originalControl,{headers:{'content-type':'text/html; charset=utf-8'}})}}};
 for(const path of ['/control','/admin/control']){
  const res=await siteWorker.fetch(new Request('https://ekodi.kr'+path),env,{});
  assert.equal(res.status,200,path);
  assert.equal(res.headers.get('x-ekodi-route'),'control-surface');
  assert.equal(res.headers.get('cache-control'),'no-store');
  assert.match(await res.text(),/EKODI Control/);
 }
 assert.ok(assetCalls.every(path=>path==='/control'||path==='/control.html'));
});

test('visible Control links point at /admin/control and task/history authentication state is preserved',()=>{
 const html=root('control.html'),script=root('control.js'),router=root('canonical-surface-router.js'),worker=root('site-worker.js'),release=JSON.parse(root('deploy/manifests/shared-site.worker.json'));
 assert.match(html,/href="\/admin\/control"/);
 assert.match(html,/src="\/control\.js/);
 assert.match(html,/href="\/control\.css/);
 assert.match(script,/HISTORY_KEY='ekodi-admin-command-history-v1'/);
 assert.match(script,/CONTROL_STATE='ekodi-control-state-v1'/);
 assert.match(script,/HISTORY_KEY='ekodi-admin-command-history-v1'/);
 assert.match(script,/TOKEN_KEY='ekodi-auth-token'/);
 assert.match(router,/path==='\/admin\/control'/);
 assert.match(worker,/url\.pathname === '\/admin\/control'/);
 const probe=release.worker.requests.find(item=>item.url==='https://ekodi.kr/admin/control');
 assert.ok(probe,'guarded release must verify canonical page');
 assert.ok(probe.headerExpect.includes('x-ekodi-canonical-path: /admin/control'));
 assert.ok(release.worker.requests.some(item=>item.url==='https://ekodi.kr/control'),'legacy back-compat probe must remain');
});

test('embedded Admin workbench retains exactly one sidebar, preserves all Control tab actions',()=>{
 const css=root('control.css'),ui=root('control.js'),home=root('admin-control-home.js');
 assert.match(home,/frame\.src='\\/control\\?embedded=admin'/);
 assert.match(ui,/data\.ekodiControlEmbedded='admin'/);
 assert.match(css,/data-ekodi-control-embedded="admin"\] \.control-rail\{/);
 assert.match(css,/position:sticky!important/);
 assert.match(css,/\.control-rail \.rail-nav\{/);
 assert.match(css,/flex-direction:row!important/);
 assert.match(css,/\.control-rail :is\(\.brand,\.recent,\.rail-foot\)\{display:none!important\}/);
 assert.match(css,/\.control-main\{margin-left:0!important/);
 assert.match(css,/\.composer-wrap\{left:0!important/);
 assert.match(ui,/\.nav-item/);
 assert.match(ui,/b\.onclick=\(\)=>setView\(b\.dataset\.view\)/);
});
