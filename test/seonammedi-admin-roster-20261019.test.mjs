import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleSeonamMediAdminApi} from '../seonammedi-admin-control.js';

// Owner request (2026-10-19): show the SeonamMedi administrator list on the site
// admin page. Only administrators may read it and it never exposes credentials.

const ALL_CAPS=JSON.stringify(['seonammedi.notice.manage','seonammedi.channel.manage','seonammedi.content.manage','seonammedi.timeline.manage','seonammedi.voice.manage','seonammedi.page.manage','seonammedi.finance.manage']);
const grants=[
  {email:'ohwon@example.com',role:'manager',enabled:1,principal_type:'member',capabilities_json:ALL_CAPS,denied_capabilities_json:'[]',expires_at:null,note:'display-name:오원옥',created_at:'2026-09-29 14:20:45',password_hash:'never'},
  {email:'kyungwon@example.com',role:'manager',enabled:1,principal_type:'member',capabilities_json:ALL_CAPS,denied_capabilities_json:'[]',expires_at:null,note:'display-name:최경원',created_at:'2026-10-15 09:23:47'},
  {email:'board@example.com',role:'board_admin',enabled:1,principal_type:'member',capabilities_json:'["seonammedi.notice.manage","seonammedi.voice.manage"]',denied_capabilities_json:'["seonammedi.finance.manage"]',expires_at:null,note:'',created_at:'2026-10-16 00:00:00'},
  {email:'disabled@example.com',role:'manager',enabled:0,principal_type:'member',capabilities_json:ALL_CAPS,denied_capabilities_json:'[]',expires_at:null,note:'',created_at:'2026-01-01'},
  {email:'expired@example.com',role:'manager',enabled:1,principal_type:'member',capabilities_json:ALL_CAPS,denied_capabilities_json:'[]',expires_at:'2020-01-01T00:00:00Z',note:'',created_at:'2026-01-01'},
  {email:'nocaps@example.com',role:'viewer',enabled:1,principal_type:'member',capabilities_json:'[]',denied_capabilities_json:'[]',expires_at:null,note:'',created_at:'2026-01-01'}
];

function env(principalEmail){
  return {DB:{prepare(sql){
    const stmt={args:[],bind(...a){this.args=a;return this},
      async first(){
        if(/FROM admins WHERE lower\(trim\(email\)\)=\? LIMIT 1/.test(sql))return null;
        if(/FROM customer_tenants WHERE slug=\?/.test(sql))return {id:7,status:'active'};
        if(/FROM customer_access_grants WHERE tenant_id=\? AND lower\(trim\(email\)\)=\?/.test(sql))return grants.find(g=>g.email===this.args[1])||null;
        return null;
      },
      async all(){
        if(/FROM admins WHERE role='super_admin'/.test(sql))return {results:[{email:'owner@example.com',created_at:'2026-07-28T13:05:42Z',password_hash:'never'}]};
        if(/FROM customer_access_grants WHERE tenant_id=\? ORDER BY/.test(sql))return {results:grants};
        return {results:[]};
      },
      async run(){return {}}};
    return stmt;
  }}};
}

async function call(path,{email='kyungwon@example.com',auth=true}={}){
  const original=globalThis.fetch;
  globalThis.fetch=async url=>{
    const u=new URL(url);
    if(u.pathname==='/auth/v1/user')return Response.json({id:'u-1',email,email_confirmed_at:'2026-01-01T00:00:00Z'});
    return new Response('{}',{status:403});
  };
  try{
    const res=await handleSeonamMediAdminApi(new Request('https://ekodi.kr/api/seonammedi'+path,{headers:auth?{authorization:'Bearer fixture'}:{}}),env(email));
    return {status:res.status,body:await res.json()};
  }finally{globalThis.fetch=original}
}

test('site administrators see the active roster with names, labels and scopes',async()=>{
  const r=await call('/admin/admins');
  assert.equal(r.status,200);
  const emails=r.body.items.map(x=>x.email);
  assert.deepEqual(emails,['owner@example.com','ohwon@example.com','kyungwon@example.com','board@example.com']);
  const owner=r.body.items[0];
  assert.equal(owner.roleLabel,'EKODI 최고관리자');assert.equal(owner.scope,'platform');
  const kyungwon=r.body.items.find(x=>x.email==='kyungwon@example.com');
  assert.equal(kyungwon.name,'최경원');assert.equal(kyungwon.roleLabel,'사이트 전체 관리자');
  assert.deepEqual(kyungwon.permissions,['공지','활동이력·관련소식','소통채널','시민의견','웹검색 게시검토','현재상황·조직·회의록','회계']);
  const board=r.body.items.find(x=>x.email==='board@example.com');
  assert.deepEqual(board.permissions,['공지','시민의견']);assert.equal(board.roleLabel,'게시판 관리자');
});

test('disabled, expired and permission-less grants are not listed; credentials never leak',async()=>{
  const r=await call('/admin/admins');
  const text=JSON.stringify(r.body);
  for(const hidden of ['disabled@example.com','expired@example.com','nocaps@example.com','password','never'])assert.ok(!text.includes(hidden),hidden);
});

test('the roster requires an authenticated SeonamMedi administrator',async()=>{
  assert.equal((await call('/admin/admins',{auth:false})).status,401);
  assert.equal((await call('/admin/admins',{email:'stranger@example.com'})).status,403);
});

test('admin page renders the roster in the access panel with the refreshed bundle',async()=>{
  const html=await readFile(new URL('../sites/seonammedi/public/admin/index.html',import.meta.url),'utf8');
  const js=await readFile(new URL('../sites/seonammedi/public/admin/admin.js',import.meta.url),'utf8');
  assert.match(html,/data-panel="access"[\s\S]*id="adminRosterCard"[\s\S]*id="adminRoster"/);
  assert.match(html,/admin\.js\?v=20261019-admin-menu-trim-1/);
  assert.match(js,/api\('\/api\/seonammedi\/admin\/admins'\)/);
  assert.match(js,/textContent=value/,'roster cells are rendered as text, never HTML');
  assert.doesNotMatch(js,/innerHTML[^;]*item\.email/);
});
