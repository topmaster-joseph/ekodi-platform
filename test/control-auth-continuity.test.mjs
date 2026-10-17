import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const auth=read('auth-site/admin-auth.js');
const control=read('control.js');
const html=read('control.html');
const css=read('control.css');

test('Google login safely returns only to the canonical Control route',()=>{
  const expr=auth.match(/const safeReturn=\(\(\)=>\{try\{.+?\}\}\)\(\);/)?.[0];
  assert.ok(expr,'central admin safeReturn expression is present');
  function get(rawReturn){
    return vm.runInNewContext(expr+';safeReturn',{
      URL,rawReturn,defaultReturn:'https://ekodi.kr/admin/',
      runtime:{environment:'production',authOrigin:'https://ekodi.kr'}
    });
  }
  assert.equal(get('https://ekodi.kr/control'),'https://ekodi.kr/control');
  assert.equal(get('https://ekodi.kr/control/'),'https://ekodi.kr/control');
  assert.equal(get('https://ekodi.kr/control?access_token=SECRET#ekodi_admin_token=SECRET'),'https://ekodi.kr/control');
  assert.equal(get('https://evil.example/control'),'https://ekodi.kr/admin/');
  assert.equal(get('https://ekodi.kr/control/api'),'https://ekodi.kr/admin/');
});

test('Control accepts a same-tab handoff exactly once and immediately cleans the URL',()=>{
  const handoff=control.match(/function acceptCentralHandoff\(\)\{[\s\S]*?\n  \}/)?.[0];
  assert.ok(handoff,'handoff function present');
  let stored={},url='/control#ekodi_admin_token=EXAMPLE';
  const location={hash:'#ekodi_admin_token=EXAMPLE',pathname:'/control',search:''};
  const sessionStorage={setItem:(key,value)=>{stored[key]=value}};
  const history={state:null,replaceState(_state,_title,target){url=target;location.hash=''}};
  const accepted=vm.runInNewContext(handoff+';acceptCentralHandoff()',{
    location,history,sessionStorage,URLSearchParams,TOKEN_KEY:'ekodi-auth-token'
  });
  assert.equal(accepted,true);
  assert.equal(stored['ekodi-auth-token'],'EXAMPLE');
  assert.equal(url,'/control');
  assert.equal(location.hash,'');
});

test('Control cannot submit tasks until server validates super-admin session',()=>{
  assert.match(control,/session=await api\('\/api\/session'\)/);
  assert.match(control,/session\?\.authenticated!==true\|\|session\?\.role!=='super_admin'/);
  assert.match(control,/renderAuth\(false,'관리자 세션 확인 중'\)/);
  assert.match(control,/if\(!state\.authorized\)\{toast\('Google 최고관리자 로그인/);
  assert.match(html,/id="controlLoginLink"/);
  assert.match(html,/return_to=https%3A%2F%2Fekodi.kr%2Fcontrol/);
  assert.match(html,/control\.css\?v=20261017-control-auth-v5/);
  assert.match(html,/control\.js\?v=20261017-control-auth-v5/);
  assert.match(css,/\.control-login\[hidden\]\{display:none!important\}/);
  assert.match(control,/\/api\/control\/ai\/v8\/pulse/);
  assert.match(control,/\/api\/control\/ai\/v8\/orchestrator\/submit/);
});
