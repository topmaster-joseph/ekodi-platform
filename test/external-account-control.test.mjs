import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleExternalAccountControl, EXTERNAL_ACCOUNT_PROVIDER_REGISTRY } from '../external-account-control.js';

const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');

test('external account center keeps provider ownership separate', () => {
  const ids = EXTERNAL_ACCOUNT_PROVIDER_REGISTRY.map(item => item.id);
  for (const id of ['google','meta','kakao','naver','microsoft','other']) assert.ok(ids.includes(id));
  const migration = read('migrations/0083_external_account_control_center.sql');
  assert.match(migration, /authority_ref/);
  assert.match(migration, /credential_ref/);
  assert.doesNotMatch(migration, /password/i);
});

test('control route requires central authentication', async () => {
  const response = await handleExternalAccountControl(new Request('https://ekodi.kr/api/control/external-accounts/summary'), {});
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'auth_required');
});

test('super admin infrastructure summary exposes account roles without secrets', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => String(url).includes('/auth/v1/user')
    ? new Response(JSON.stringify({ id:'u1', email:'topmaster.joseph@gmail.com' }), { status:200, headers:{'content-type':'application/json'} })
    : new Response(JSON.stringify([]), { status:200, headers:{'content-type':'application/json'} });
  try {
    const request = new Request('https://ekodi.kr/api/control/external-accounts/infrastructure', { headers:{ authorization:'Bearer session' } });
    const response = await handleExternalAccountControl(request, {
      MY_SUPABASE_URL:'https://example.supabase.co',
      MY_SUPABASE_PUBLISHABLE_KEY:'public-key',
      ADMIN_GOOGLE_BOOTSTRAP_EMAILS:'topmaster.joseph@gmail.com',
      CLOUDFLARE_ACCOUNT_ID:'6986123412341234d797',
      CLOUDFLARE_API_TOKEN:'primary-secret',
      CLOUDFLARE_AUXILIARY_ACCOUNT_ID:'46aad4738793fbaca88574832a2ccc0f',
      CLOUDFLARE_AUXILIARY_API_TOKEN:'aux-secret'
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    const accounts = body.infrastructure.cloudflare.accounts;
    assert.equal(accounts.length, 2);
    assert.equal(accounts[0].identityEmail, 'topmaster.joseph@gmail.com');
    assert.equal(accounts[0].planClass, 'workers-paid');
    assert.equal(accounts[1].identityEmail, 'joseph@ekodi.kr');
    assert.equal(accounts[1].planClass, 'free-preferred');
    assert.equal(accounts[0].secretVisible, false);
    assert.equal(accounts[1].secretVisible, false);
    assert.match(accounts[0].accountIdMasked, /^6986…d797$/);
    assert.doesNotMatch(JSON.stringify(body), /primary-secret|aux-secret/);
    assert.equal(body.secretPolicy.acceptPlaintextSecrets, false);
  } finally { globalThis.fetch = originalFetch; }
});

test('workspace summary projects manage permissions from the canonical workspace role', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const href=String(url);
    if(href.includes('/auth/v1/user'))return new Response(JSON.stringify({id:'u1',email:'manager@example.com'}),{status:200,headers:{'content-type':'application/json'}});
    if(href.includes('current_site_activity_contexts'))return new Response(JSON.stringify([{tenant_id:'t1',tenant:'jadam',workspace_name:'Jadam',authorization_role:'manager'}]),{status:200,headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify([]),{status:200,headers:{'content-type':'application/json'}});
  };
  const DB={prepare:()=>({all:async()=>({results:[]})})};
  try{
    const request=new Request('https://ekodi.kr/api/control/external-accounts/summary?workspace=jadam',{headers:{authorization:'Bearer session'}});
    const response=await handleExternalAccountControl(request,{MY_SUPABASE_URL:'https://example.supabase.co',MY_SUPABASE_PUBLISHABLE_KEY:'public-key',DB});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.deepEqual(body.permissions,{view:true,manage:true,register:true,update:true,reassign:false,audit:true,secretMaterial:false});
    assert.equal(body.workspace,'jadam');
  }finally{globalThis.fetch=originalFetch}
});

test('super admin can reassign a generic connection only to a canonical tenant and audit the change', async () => {
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>String(url).includes('/auth/v1/user')
    ? new Response(JSON.stringify({id:'u1',email:'topmaster.joseph@gmail.com'}),{status:200,headers:{'content-type':'application/json'}})
    : new Response(JSON.stringify([]),{status:200,headers:{'content-type':'application/json'}});
  const calls=[];
  const row={
    id:'xac_1',workspace_id:'old-id',workspace_slug:'jadam',provider:'other',service_key:'delivery',
    provider_account_id:'merchant-1',display_name:'Old',login_hint:'',connection_mode:'delegated',status:'active',
    scopes_json:'[]',capabilities_json:'[]',authority_ref:'',last_verified_at:null,last_error:''
  };
  const DB={prepare(sql){return{bind(...args){return{
    first:async()=>{
      if(sql.includes('FROM external_account_connections'))return row;
      if(sql.includes('FROM customer_tenants WHERE slug=?'))return args[0]==='pizzamaru'?{id:'tenant-pizza',slug:'pizzamaru',name:'PizzaMaru'}:null;
      return null;
    },
    run:async()=>{calls.push({sql,args});return{success:true}},
    all:async()=>({results:[]})
  }} ,all:async()=>({results:[]})}}};
  try{
    const request=new Request('https://ekodi.kr/api/control/external-accounts/accounts/xac_1',{
      method:'PATCH',headers:{authorization:'Bearer session','content-type':'application/json'},
      body:JSON.stringify({workspaceSlug:'pizzamaru',displayName:'Pizza Delivery',status:'active'})
    });
    const response=await handleExternalAccountControl(request,{
      MY_SUPABASE_URL:'https://example.supabase.co',
      MY_SUPABASE_PUBLISHABLE_KEY:'public-key',
      ADMIN_GOOGLE_BOOTSTRAP_EMAILS:'topmaster.joseph@gmail.com',
      DB
    });
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.workspace,'pizzamaru');
    assert.ok(calls.some(x=>x.sql.includes('UPDATE external_account_connections SET workspace_id=?,workspace_slug=?')&&x.args[0]==='tenant-pizza'&&x.args[1]==='pizzamaru'));
    assert.ok(calls.some(x=>x.sql.includes('INSERT INTO external_account_audit')&&x.args.includes('connection.reassign')));
    assert.ok(calls.some(x=>x.sql.includes('INSERT INTO external_account_audit')&&x.args.includes('connection.update')));
  }finally{globalThis.fetch=originalFetch}
});

test('non-super workspace manager cannot reassign a connection to another workspace', async () => {
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    const href=String(url);
    if(href.includes('/auth/v1/user'))return new Response(JSON.stringify({id:'u1',email:'manager@example.com'}),{status:200,headers:{'content-type':'application/json'}});
    if(href.includes('current_site_activity_contexts'))return new Response(JSON.stringify([{tenant_id:'t1',tenant:'jadam',workspace_name:'Jadam',authorization_role:'manager'}]),{status:200,headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify([]),{status:200,headers:{'content-type':'application/json'}});
  };
  const DB={prepare(sql){return{bind(){return{
    first:async()=>sql.includes('external_account_connections')?{id:'xac_1',workspace_id:'t1',workspace_slug:'jadam',provider:'other',service_key:'general',provider_account_id:'a',display_name:'A',login_hint:'',connection_mode:'delegated',status:'active',scopes_json:'[]',capabilities_json:'[]',authority_ref:'',last_verified_at:null,last_error:''}:null,
    run:async()=>({success:true}),all:async()=>({results:[]})
  }},all:async()=>({results:[]})}}};
  try{
    const request=new Request('https://ekodi.kr/api/control/external-accounts/accounts/xac_1',{
      method:'PATCH',headers:{authorization:'Bearer session','content-type':'application/json'},
      body:JSON.stringify({workspaceSlug:'pizzamaru'})
    });
    const response=await handleExternalAccountControl(request,{MY_SUPABASE_URL:'https://example.supabase.co',MY_SUPABASE_PUBLISHABLE_KEY:'public-key',DB});
    assert.equal(response.status,403);
    assert.equal((await response.json()).error,'workspace_reassign_super_admin_required');
  }finally{globalThis.fetch=originalFetch}
});

test('registration rejects direct secret material before persistence', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => String(url).includes('/auth/v1/user')
    ? new Response(JSON.stringify({ id:'u1', email:'joseph@ekodi.kr' }), { status:200, headers:{'content-type':'application/json'} })
    : new Response(JSON.stringify([]), { status:200, headers:{'content-type':'application/json'} });
  try {
    const request = new Request('https://ekodi.kr/api/control/external-accounts/accounts', { method:'POST', headers:{ authorization:'Bearer session', 'content-type':'application/json' }, body:JSON.stringify({ workspaceSlug:'platform', provider:'google', providerAccountId:'church@example.com', password:'never-store-this' }) });
    const response = await handleExternalAccountControl(request, { MY_SUPABASE_URL:'https://example.supabase.co', MY_SUPABASE_PUBLISHABLE_KEY:'public-key', ADMIN_GOOGLE_BOOTSTRAP_EMAILS:'topmaster.joseph@gmail.com,joseph@ekodi.kr' });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'secret_material_not_accepted');
  } finally { globalThis.fetch = originalFetch; }
});

test('admin UI and mission control expose the central account center', () => {
  assert.match(read('mission-control-entry-worker.js'), /handleExternalAccountControl/);
  assert.match(read('admin-menu-runtime.js'), /external-accounts/);
  assert.match(read('external-account-admin.js'), /<h2>계정·연결<\/h2>/);
  assert.match(read('admin-menu-runtime.js'), /계정·연결/);
  assert.doesNotMatch(read('external-account-admin.js'), /name="password"/);
});

test('external account control allows only configured browser origins with credential-safe CORS', () => {
  const source=read('mission-control-entry-worker.js');
  assert.match(source,/handleExternalAccountPreflight/);
  assert.match(source,/GET, POST, PATCH, OPTIONS/);
  assert.match(source,/externalAccountCorsResponse\(response, request, env\)/);
  assert.match(source,/allowedControlOrigin\(request, env\)/);
  assert.doesNotMatch(source,/external-accounts[\s\S]{0,1000}access-control-allow-origin['"]?:['"]?\*/);
  const wrangler=read('wrangler.api.toml');
  assert.match(wrangler,/ALLOWED_ORIGINS = .*https:\/\/ekodi\.kr/);
});


test('external account admin reuses mail OAuth instead of collecting Gmail secrets', () => {
  const source = read('external-account-admin.js');
  assert.match(source, /Google · Gmail 계정 추가/);
  assert.match(source, /\/api\/mail\/control/);
  assert.match(source, /connect\/google/);
  assert.match(source, /grantSelfRead:true/);
  assert.match(source, /grantSelfSend:false/);
  assert.match(source, /data-xac-gmail-scope/);
  assert.match(source, /메일 원본은 삭제되지 않습니다/);
  assert.match(source, /Gmail은 위의 “Google · Gmail 계정 추가”에서 공식 OAuth로 연결/);
  assert.doesNotMatch(source, /hamchansa@gmail\.com/);
  assert.doesNotMatch(source, /name="password"/);
});


test('workspace admins inherit connection settings without platform infrastructure exposure', () => {
  const runtime=read('admin-menu-runtime.js');
  assert.match(runtime,/data-admin-link="workspace-connections"/);
  assert.match(runtime,/data-panel~="workspace-connections"/);
  assert.match(runtime,/summary\?workspace=/);
  assert.match(runtime,/body\.workspaceSlug=currentContext\.id/);
  assert.match(runtime,/비밀번호·API Token·Secret·OAuth Token 원문은 입력하지 않습니다/);
  assert.match(runtime,/currentContext\.type==='workspace'/);
  assert.doesNotMatch(runtime,/CLOUDFLARE_AUXILIARY_API_TOKEN/);
  assert.doesNotMatch(runtime,/CLOUDFLARE_API_TOKEN/);
});

test('account center uses canonical workspace choices and audited soft revoke management', () => {
  const source=read('external-account-admin.js');
  assert.match(source,/data-xac-register-workspace/);
  assert.match(source,/data-xac-edit-form/);
  assert.match(source,/수정·배정/);
  assert.match(source,/연결을 해제 상태로 전환/);
  assert.match(source,/status:'revoked'/);
  assert.match(source,/data-xac-audit-list/);
  assert.match(source,/계정 변경 이력/);
  assert.match(source,/workspaceOptions\(data\)/);
  assert.doesNotMatch(source,/운영주체 slug<input/);
  assert.doesNotMatch(source,/method:'DELETE'/);
});

test('account center separates infrastructure, work accounts, channels and services', () => {
  const source = read('external-account-admin.js');
  for (const tab of ['infra','work','channels','services']) assert.match(source, new RegExp(`data-xac-tab="${tab}"`));
  assert.match(source, /Cloudflare ·/);
  assert.match(source, /비용·사용량/);
  assert.match(source, /API Token·Secret 원문/);
  assert.doesNotMatch(source, /type="password"/);
});

test('external account admin changes trigger the canonical shared-site production owner', () => {
  const control = read('.github/workflows/deploy-control-api.yml');
  assert.match(control, /- 'external-account-control\.js'/);
  assert.match(control, /- 'cloudflare-account-pool\.js'/);
  const workflow = read('.github/workflows/deploy-site-core.yml');
  assert.match(workflow, /- 'external-account-admin\.js'/);
  assert.match(workflow, /- 'test\/external-account-control\.test\.mjs'/);
  assert.ok((workflow.match(/external-account-admin\.js/g) || []).length >= 2);
  assert.match(workflow, /node --check "\$f"/);
});
