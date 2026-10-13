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
  const frameJs=read('admin-control-frame.js');
  assert.match(html,/<section class="admin-control-home" id="adminControlHome" data-panel="command-home"/);
  assert.match(html,/<iframe id="adminControlFrame"/);
  assert.match(html,/data-src="\/admin\/control\?embed=admin"/);
  assert.doesNotMatch(html,/<iframe[^>]*\ssrc="\/admin\/control\?embed=admin"/);
  assert.match(layout,/function activateCommandHome\(\)\{/);
  assert.match(compact,/function Q\(\)\{v=X,z\(X\),f\(X\)\}/);
  // Control panel activation is deliberately external to the compact menu's
  // strict 10 KB first-paint budget.
  assert.match(frameJs,/ekodi-admin-section-changed/);
  assert.match(frameJs,/ekodi-admin-ready/);
  assert.match(frameJs,/frame\.setAttribute\('src',frame\.dataset\.src\)/);
  assert.match(sidebar,/window\.EKODIAdminPanels\.activate\('command-home'\)/);
  assert.match(css,/#adminControlFrame/);
  assert.match(html,/id="adminControlFrameNotice" role="status" hidden/);
  assert.match(html,/src="\/admin\/admin-control-frame\.js" defer/);
  assert.match(frameJs,/frame\.addEventListener\('error'/);
  assert.match(frameJs,/frame\.addEventListener\('load'/);
  assert.match(frameJs,/documentRoot\?\.getElementById\('commandForm'\)/);
  assert.match(frameJs,/reportFailure\(\)/);
  assert.match(css,/#adminControlFrameNotice\.admin-control-frame-notice/);
  assert.match(css,/body:has\(#adminControlHome:not\(\[hidden\]\)\) \.ekodi-assist-bootstrap/);
  assert.match(build,/'admin-control-integration\.css'/);
  assert.match(build,/'admin-control-frame\.js'/);
  assert.equal((html.match(/<aside class="sidebar"/g)||[]).length,1);
});

test('Control embedded presentation hides duplicate navigation and preserves auth and tasks',()=>{
  const css=read('control.css'),js=read('control.js'),html=read('control.html');
  assert.match(css,/html\[data-control-embed="admin"\] \.control-rail\s*\{display:none!important\}/);
  assert.match(css,/html\[data-control-embed="admin"\] \.composer-wrap/);
  assert.match(js,/document\.documentElement\.dataset\.controlEmbed='admin'/);
  assert.match(js,/await verifySession\(\)/);
  assert.match(js,/preflightVerified:preflight/);
  assert.match(js,/HISTORY_KEY='ekodi-admin-command-history-v2'/);
  assert.match(js,/function bindAccount\(session\)/);
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
  const byUrl=url=>manifest.worker.requests.find(r=>r.url===url);
  const home=byUrl('https://ekodi.kr/admin/');
  assert.ok(home.expect.includes('id="adminControlFrame"'));
  assert.ok(home.expect.includes('admin-control-frame.js'));
  for(const url of [
    'https://ekodi.kr/admin/admin-control-integration.css',
    'https://ekodi.kr/admin/admin-control-frame.js',
  ]){
    assert.deepEqual(byUrl(url)?.statuses,[200]);
  }
});

test('embedded EKODI Control honors the white administrator canvas, including errors and mobile',()=>{
  const css=read('control.css');
  const outer=read('admin-control-integration.css');
  const marker='/* EKODI white embedded Control contract */';
  assert.equal(css.split(marker).length,2,'white embedded theme must be declared once');
  const scoped=css.split(marker)[1];
  assert.match(scoped,/html\[data-control-embed="admin"\]\s*\{[\s\S]*color-scheme:light/);
  for(const section of ['.control-main','.topbar','.control-tabs','.view.active','.conversation','.composer','.composer textarea','.auth-banner']){
    assert.ok(scoped.includes(section),'white theme missing '+section);
  }
  assert.match(scoped,/\.turn\.assistant \.bubble\s*\{\s*color:#17253d!important/);
  assert.match(scoped,/\.turn\.user \.bubble\s*\{[\s\S]*?background:#eaf1ff!important/);
  assert.match(scoped,/\.send\s*\{\s*background:#2862ee!important;color:#fff!important/);
  assert.doesNotMatch(outer,/#0b1626/i,'no dark fallback may cover the white Control surface');
  assert.match(outer,/#adminControlHome\.admin-control-home\s*\{[\s\S]*?background:#fff/);
  assert.match(outer,/#adminControlFrameNotice strong\{font-size:18px;color:#17253d\}/);
  assert.ok(css.includes('html[data-control-embed="admin"] .conversation{padding-bottom:18px!important}'),'mobile conversation spacing must remain');
});
