import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import siteWorker from '../site-worker.js';
import platformRouter from '../platform-router-entry-worker.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const controlHtml='<!doctype html><html lang="ko"><body><form id="commandForm">EKODI Control</form></body></html>';
function fixture(){
  const assets=[];
  const env={ASSETS:{async fetch(req){
    const pathname=new URL(req.url).pathname;assets.push(pathname);
    return new Response(pathname==='/control'?controlHtml:'asset',{headers:{'content-type':pathname==='/control'?'text/html; charset=utf-8':'text/plain'}});
  }}};
  return {env,assets};
}

test('admin root reuses one sidebar and loads Control only after auth navigation',()=>{
  const html=read('admin-shell.html');
  const layout=read('admin-menu-layout.js');
  const compact=read('admin-menu-layout.compact.js');
  const sidebar=read('admin-sidebar.js');
  const css=read('admin-control-integration.css');
  const build=read('scripts/build.mjs');
  assert.match(html,/<section class="admin-control-home" id="adminControlHome" data-panel="command-home"/);
  assert.match(html,/<iframe id="adminControlFrame"/);
  assert.match(html,/data-src="\/admin\/control\?embed=admin"/);
  assert.doesNotMatch(html,/<iframe[^>]*\ssrc="\/admin\/control\?embed=admin"/);
  assert.match(layout,/panelTargets\(panel\)\.includes\(COMMAND_HOME\)/);
  assert.match(layout,/!frame\.hasAttribute\('src'\)/);
  assert.match(compact,/function Q\(\)\{v=X;for\(const e of s\.querySelectorAll\("\[data-panel\]"\)\)/);
  assert.match(compact,/e\.hasAttribute\("src"\)/);
  assert.match(sidebar,/window\.EKODIAdminPanels\.activate\('command-home'\)/);
  assert.match(css,/#adminControlFrame/);
  assert.match(css,/body:has\(#adminControlHome:not\(\[hidden\]\)\) \.ekodi-assist-bootstrap/);
  assert.match(build,/'admin-control-integration\.css'/);
  assert.equal((html.match(/<aside class="sidebar"/g)||[]).length,1);
});

test('Control embedded presentation hides duplicate navigation and preserves auth and tasks',()=>{
  const css=read('control.css'),js=read('control.js'),html=read('control.html');
  assert.match(css,/html\[data-control-embed="admin"\] \.control-rail\s*\{display:none!important\}/);
  assert.match(css,/html\[data-control-embed="admin"\] \.composer-wrap/);
  assert.match(js,/document\.documentElement\.dataset\.controlEmbed='admin'/);
  assert.match(js,/await verifySession\(\)/);
  assert.match(js,/preflightVerified:preflight/);
  assert.match(js,/HISTORY_KEY='ekodi-admin-command-history-v1'/);
  assert.match(html,/id="commandForm"/);
});

for(const layer of [{name:'site-worker',handler:siteWorker},{name:'platform-router',handler:platformRouter}]){
  test(layer.name+' permits only same-origin framing for the explicit admin embed URL',async()=>{
    const {env}=fixture();
    for(const path of ['/admin/control?embed=admin','/admin/control/?embed=admin']){
      const response=await layer.handler.fetch(new Request('https://ekodi.kr'+path),env,{waitUntil(){}});
      assert.equal(response.status,200);
      assert.equal(response.headers.get('x-frame-options'),'SAMEORIGIN');
      assert.match(response.headers.get('content-security-policy')||'',/frame-ancestors 'self'/);
      assert.equal(response.headers.get('x-ekodi-route'),'control-surface');
    }
    for(const path of ['/admin/control','/admin/control?embed=other']){
      const response=await layer.handler.fetch(new Request('https://ekodi.kr'+path),env,{waitUntil(){}});
      assert.equal(response.status,200);
      assert.equal(response.headers.get('x-frame-options'),'DENY');
      assert.match(response.headers.get('content-security-policy')||'',/frame-ancestors 'none'/);
    }
  });
}

test('guarded deployment checks a frameable same-origin admin Control endpoint',()=>{
  const manifest=JSON.parse(read('deploy/manifests/shared-site.worker.json'));
  const probe=manifest.worker.requests.find(r=>r.url==='https://ekodi.kr/admin/control?embed=admin');
  assert.ok(probe);
  assert.deepEqual(probe.statuses,[200]);
  assert.ok(probe.headerExpect.includes('x-frame-options: SAMEORIGIN'));
  assert.ok(probe.headerExpect.includes('x-ekodi-route: control-surface'));
});
