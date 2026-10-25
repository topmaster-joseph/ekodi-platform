import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMarketingOrderConnectors } from '../marketing-order-connectors.js';
import { storeAdminScript } from '../store-admin-engine.js';

// Production 2026-10-25: joseph@ekodi.kr is tenant_admin of tenant "ekodibiz" (store admin
// opened as FULL) but the connector API only accepted direct store rows, so CMPMYI 연결관리
// showed "현재 권한으로 이 영역을 사용할 수 없습니다".
const JADAM='4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa';
const TEMPLATES={[JADAM]:{workspace_type:'store',workspace_key:JADAM,tenant_slug:'ekodibiz',store_id:JADAM,template_key:'food_b2c',identity_salt:'s'}};
function env(){
  const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>/marketing_workspace_templates/.test(sql)?TEMPLATES[args[0]]||null:null,all:async()=>({results:[{id:1,provider:'baemin',connector_kind:'delivery_app',mode:'import_only',status:'partner_required',display_name:'배달의민족',bridge_key_hash:null,synced_records:0}]}),run:async()=>({meta:{}})});
  return{DB:{prepare:sql=>stmt(sql)},ALLOWED_ORIGINS:'https://ekodi.kr'};
}
function withWorkspaces(workspaces,fn){
  const original=globalThis.fetch;
  globalThis.fetch=async url=>{
    const u=String(url);
    if(u.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'u1',email:'a@ekodi.kr',email_confirmed_at:'2026-01-01T00:00:00Z'}),{status:200});
    if(u.includes('current_site_workspaces'))return new Response(JSON.stringify(workspaces),{status:200});
    return new Response('{}',{status:404});
  };
  return fn().finally(()=>{globalThis.fetch=original});
}
const status=()=>handleMarketingOrderConnectors(new Request(`https://ekodi.kr/api/marketing/connectors/status?store=${JADAM}`,{headers:{authorization:'Bearer t'}}),env());
const tenantRow=(over={})=>({workspace_key:'tenant:25d0a2d7-7e52-47bc-abc7-b2fcc46b3070',workspace_kind:'business',tenant:'ekodibiz',role:'tenant_admin',status:'active',store_id:null,...over});

test('tenant_admin of the store tenant can read store connectors without a direct store row',async()=>{
  await withWorkspaces([{workspace_key:'account:marketing',role:'member'},tenantRow()],async()=>{
    const r=await status();assert.equal(r.status,200);assert.equal((await r.json()).connectors.length,1);
  });
});

test('direct store managers keep working exactly as before',async()=>{
  await withWorkspaces([{workspace_key:`store:${JADAM}`,store_id:JADAM,role:'store_owner',status:'active'}],async()=>{
    assert.equal((await status()).status,200);
  });
});

test('other tenants, non-admin tenant roles and inactive rows stay blocked',async()=>{
  for(const rows of [
    [tenantRow({tenant:'other-tenant'})],
    [tenantRow({role:'member'})],
    [tenantRow({role:'store_staff'})],
    [tenantRow({role:'hq_manager'})],
    [tenantRow({status:'pre_registered'})],
    [{workspace_key:'account:marketing',role:'tenant_admin',tenant:'ekodibiz'}],
    [],
  ]){
    await withWorkspaces(rows,async()=>{assert.equal((await status()).status,403,JSON.stringify(rows))});
  }
});

test('store staff with a direct store row still cannot manage connectors',async()=>{
  await withWorkspaces([{workspace_key:`store:${JADAM}`,store_id:JADAM,role:'store_staff',status:'active'}],async()=>{
    assert.equal((await status()).status,403);
  });
});

test('CMPMYI-embedded store admin keeps ?embed=cmpmyi on every in-frame navigation',async()=>{
  const js=await storeAdminScript().text();
  assert.match(js,/function embedHref\(href\)/);
  assert.match(js,/location\.assign\(embedHref\(ADMIN_BASE\)\)/);
  assert.match(js,/location\.assign\(embedHref\(deliveryHref\(/);
  assert.doesNotMatch(js,/location\.assign\(ADMIN_BASE\)/);
  // Evaluate the helper in isolation.
  const src=js.slice(js.indexOf('function embedHref(href){'),js.indexOf("if(IS_CMPMYI_EMBED)document.addEventListener('click'"));
  const make=embed=>new Function('IS_CMPMYI_EMBED','location',`${src};return embedHref;`)(embed,{href:'https://ekodi.kr/jadam/admin/connections?embed=cmpmyi',origin:'https://ekodi.kr'});
  const on=make(true),off=make(false);
  assert.equal(on('/jadam/admin/overview'),'/jadam/admin/overview?embed=cmpmyi');
  assert.equal(on('/jadam/admin/delivery?days=7'),'/jadam/admin/delivery?days=7&embed=cmpmyi');
  assert.equal(on('/jadam/admin/menu?embed=cmpmyi'),'/jadam/admin/menu?embed=cmpmyi');
  assert.equal(on('https://evil.example/jadam/admin'),'https://evil.example/jadam/admin');
  assert.equal(on('/jadam/site'),'/jadam/site');
  assert.equal(off('/jadam/admin/overview'),'/jadam/admin/overview');
});

test('CMPMYI-embedded login runs at top level and hands the session back to CMPMYI',async()=>{
  const js=await storeAdminScript().text();
  // Login link breaks out of the frame (Google/EKODI auth refuse framing).
  assert.match(js,/href="\$\{esc\(authUrl\(\)\)\}"\$\{IS_CMPMYI_EMBED\?' target="_top"':''\}/);
  assert.match(js,/back\.searchParams\.set\('cmpmyi_return','1'\)/);
  // On return: share with the three CMPMYI store frames only, then go back to CMPMYI.
  const boot=js.slice(js.indexOf("get('cmpmyi_return')==='1'"),js.indexOf("location.replace('/cmpmyi/admin')")+40);
  assert.match(boot,/FIRST_STORE_SLUGS\.has\(SLUG\)/);
  assert.match(boot,/localStorage\.setItem\(CENTRAL_CMPMYI_SESSION_KEY/);
  assert.match(boot,/location\.replace\('\/cmpmyi\/admin'\)/);
});
