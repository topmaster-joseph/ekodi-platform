import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
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

test('logged-out canonical Control offers Google Admin login returning to the exact page',()=>{
  const source=read('control.js');
  const start=source.indexOf('  function renderAdminControlLogin(logged){');
  const end=source.indexOf('\n  async function boot()',start);
  assert.ok(start>=0&&end>start,'expected focused login helper before Control boot');
  const status={textContent:'',link:null,replaceChildren(node){this.link=node;}};
  const document={
    createElement(tag){
      assert.equal(tag,'a');
      return {href:'',textContent:'',attributes:{},setAttribute(key,value){this.attributes[key]=value;}};
    }
  };
  const context={
    API:'https://ekodi.kr',URL,document,
    $:selector=>selector==='#authState'?status:null
  };
  const render=vm.runInNewContext(source.slice(start,end)+'\nrenderAdminControlLogin',context);
  render(false);
  assert.ok(status.link,'signed-out state needs an actionable Google login link');
  assert.equal(status.link.textContent,'관리자 Google 로그인');
  const auth=new URL(status.link.href);
  assert.equal(auth.origin,'https://ekodi.kr');
  assert.equal(auth.pathname,'/auth/');
  assert.equal(auth.searchParams.get('site'),'admin');
  assert.equal(auth.searchParams.get('direct'),'1');
  assert.equal(auth.searchParams.get('return_to'),'https://ekodi.kr/admin/control');
  assert.equal(status.link.attributes['aria-label'],'최고관리자 Google 로그인 후 EKODI Control로 복귀');
  render(true);
  assert.equal(status.textContent,'최고관리자 세션');
});

test('admin handoff token is scrubbed and only accepted after super-admin verification',async()=>{
  const source=read('control.js');
  const begin=source.indexOf('  async function acceptVerifiedAdminControlHandoff(){');
  const end=source.indexOf('\n  function renderAdminControlLogin(logged){',begin);
  assert.ok(begin>=0&&end>begin,'expected verified OAuth handoff helper');
  const helper=source.slice(begin,end)+'\nacceptVerifiedAdminControlHandoff';

  async function run(role){
    const value='example-admin-handoff-token';
    const location={pathname:'/admin/control',search:'?task=123',hash:'#ekodi_admin_token='+value};
    const replaced=[];
    const stored=new Map();
    const network=[];
    const context={
      URLSearchParams,API:'https://ekodi.kr',TOKEN_KEY:'ekodi-auth-token',
      location,document:{title:'EKODI Control'},
      history:{state:{},replaceState(_state,_title,next){replaced.push(next);}},
      token:()=>stored.get('ekodi-auth-token')||'',
      sessionStorage:{setItem:(key,v)=>stored.set(key,v)},
      fetch:async (url,options)=>{
        network.push({url,options});
        return new Response(JSON.stringify({authenticated:true,role}),{
          status:200,headers:{'content-type':'application/json'}
        });
      }
    };
    const accept=vm.runInNewContext(helper,context);
    const success=await accept();
    return{success,stored,replaced,network,value};
  }

  const allowed=await run('super_admin');
  assert.equal(allowed.success,true);
  assert.equal(allowed.stored.get('ekodi-auth-token'),allowed.value);
  assert.deepEqual(allowed.replaced,['/admin/control?task=123']);
  assert.equal(allowed.network.length,1);
  assert.equal(allowed.network[0].url,'https://ekodi.kr/api/session');
  assert.equal(allowed.network[0].options.credentials,'same-origin');
  assert.equal(allowed.network[0].options.headers.authorization,'Bearer '+allowed.value);

  const denied=await run('viewer');
  assert.equal(denied.success,false);
  assert.equal(denied.stored.has('ekodi-auth-token'),false);
  assert.deepEqual(denied.replaced,['/admin/control?task=123']);
  assert.match(source,/await acceptVerifiedAdminControlHandoff\(\)/);
});

test('every Site Core promotion verifies canonical and legacy Control in independent desktop/mobile browsers',()=>{
 const flow=read('.github/workflows/deploy-site-core.yml');
 for(const [name,device] of [
  ['native_control_verification_desktop','desktop'],
  ['native_control_verification_mobile','mobile-portrait']
 ]){
  const start=flow.indexOf('  '+name+':');
  assert.ok(start>=0,name+' job is required');
  const rest=flow.slice(start+name.length+4);
  const match=rest.match(/^[\\s\\S]*?(?=\\n  [a-zA-Z_][a-zA-Z0-9_-]*:|$)/);
  const job=match?.[0]||'';
  assert.match(job,/needs:\\s*deploy/);
  assert.match(job,/uses: \\.\\/\\.github\\/workflows\\/ekodi-background-browser-worker\\.yml/);
  assert.match(job,/verification_lane: control-canonical/);
  assert.match(job,/surface_paths: \\/admin\\/control,\\/control/);
  assert.ok(job.includes('device_profile: '+device));
 }
 // Keep original site-core board and service route coverage unchanged.
 for(const name of ['native_surface_verification_desktop','native_surface_verification_mobile']){
  const job=flow.split('  '+name+':')[1]?.split('\\n  native_')[0]||'';
  assert.match(job,/surface_registry: config\\/board-surface-verification\\.json/);
  assert.match(job,/\\/ekodibiz\\/seasonal-workers\\/office/);
 }
 const worker=read('.github/workflows/ekodi-background-browser-worker.yml');
 assert.match(worker,/Independent canonical \\/admin\\/control UI/);
 assert.match(worker,/contains\\("관리자 Google 로그인"\\)/);
 assert.match(worker,/contains\\("보호된 배포 요청"\\)/);
 assert.match(worker,/test\\("\\^https:\\/\\/ekodi\\[\\.\\]kr\\/admin\\/control\\/\\?\\$"\\)/);
});
