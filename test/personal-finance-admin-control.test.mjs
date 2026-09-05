import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import worker from '../personal-finance-worker.js';
import { PERSONAL_FINANCE_ADMIN_CONTROL_CONTRACT } from '../personal-finance-service-control.js';

function fakeDb(initial={}){
  const calls=[],config={service_enabled:1,manual_entry_enabled:1,file_import_enabled:1,planning_enabled:1,updated_at:'2026-09-06T00:00:00.000Z',...(initial.config||{})};
  return{calls,config,prepare(sql){const stmt={sql,args:[],bind(...args){this.args=args;return this},async run(){calls.push({kind:'run',sql,args:this.args});if(/UPDATE personal_finance_service_config/.test(sql)){config.service_enabled=this.args[0];config.manual_entry_enabled=this.args[1];config.file_import_enabled=this.args[2];config.planning_enabled=this.args[3];config.updated_at=this.args[4]}return{success:true,meta:{changes:1}}},async first(){calls.push({kind:'first',sql,args:this.args});if(/FROM personal_finance_service_config/.test(sql))return{...config};if(/FROM d1_migrations/.test(sql))return{migrationCount:4,latestMigration:'0004_personal_finance_service_control.sql'};return null},async all(){calls.push({kind:'all',sql,args:this.args});return{results:[]}}};return stmt},async batch(stmts){for(const stmt of stmts)await stmt.run();return stmts.map(()=>({success:true}))}};
}
const env=DB=>({PERSONAL_DB:DB,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'publishable'});
const adminHeaders={authorization:'Bearer admin-token',origin:'https://admin.ekodi.kr','content-type':'application/json'};
const userHeaders={authorization:'Bearer user-token',origin:'https://my.ekodi.kr','content-type':'application/json'};

async function withFetch({role='super_admin',elevated=false,user=false}={},fn){
  const original=globalThis.fetch;
  globalThis.fetch=async input=>{const url=String(input instanceof Request?input.url:input);if(url.includes('/api/admin-access/elevation'))return new Response(JSON.stringify({elevated,authority:{role}}),{status:200,headers:{'content-type':'application/json'}});if(url.includes('/api/session'))return new Response(JSON.stringify({authenticated:true,email:'admin@example.com',role}),{status:200,headers:{'content-type':'application/json'}});if(url.includes('/auth/v1/user'))return new Response(user?JSON.stringify({id:'user-1',email:'user@example.com'}):'{}',{status:user?200:401,headers:{'content-type':'application/json'}});return new Response('{}',{status:404,headers:{'content-type':'application/json'}})};
  try{return await fn()}finally{globalThis.fetch=original}
}
test('admin control exposes only service policy and immutable safety metadata',async()=>{
  const DB=fakeDb();const response=await withFetch({},()=>worker.fetch(new Request('https://personal-finance-api.ekodi.kr/api/admin/personal-finance/control',{headers:adminHeaders}),env(DB)));
  assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'https://admin.ekodi.kr');const data=await response.json();
  assert.equal(data.service.dataBoundary,'dedicated-d1');assert.equal(data.schema.latestMigration,'0004_personal_finance_service_control.sql');assert.equal(data.safety.actionCeiling,'L2');assert.equal(data.safety.financialExecution,false);assert.equal(data.safety.aiWriteEnabled,false);assert.equal(data.safety.personalDataAdminReadable,false);assert.equal(data.admin.canWrite,true);
  const serialized=JSON.stringify(data);for(const forbidden of ['currentBalance','transactions','accounts','profileId'])assert.equal(serialized.includes(forbidden),false,forbidden);
});

test('operator cannot change Personal Finance operating policy',async()=>{
  const DB=fakeDb();const response=await withFetch({role:'operator',elevated:true},()=>worker.fetch(new Request('https://personal-finance-api.ekodi.kr/api/admin/personal-finance/control',{method:'PUT',headers:adminHeaders,body:JSON.stringify({fileImportEnabled:false})}),env(DB)));
  assert.equal(response.status,403);assert.equal((await response.json()).code,'PF_ADMIN_FORBIDDEN');assert.equal(DB.config.file_import_enabled,1);
});

test('super admin write requires current Google elevation',async()=>{
  const DB=fakeDb();const response=await withFetch({elevated:false},()=>worker.fetch(new Request('https://personal-finance-api.ekodi.kr/api/admin/personal-finance/control',{method:'PUT',headers:adminHeaders,body:JSON.stringify({planningEnabled:false})}),env(DB)));
  assert.equal(response.status,403);assert.equal((await response.json()).code,'ELEVATION_REQUIRED');assert.equal(DB.config.planning_enabled,1);
});
test('elevated super admin can change only the four bounded feature flags',async()=>{
  const DB=fakeDb();const response=await withFetch({elevated:true},()=>worker.fetch(new Request('https://personal-finance-api.ekodi.kr/api/admin/personal-finance/control',{method:'PUT',headers:adminHeaders,body:JSON.stringify({serviceEnabled:true,manualEntryEnabled:false,fileImportEnabled:false,planningEnabled:true})}),env(DB)));
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.config.manualEntryEnabled,false);assert.equal(data.config.fileImportEnabled,false);assert.equal(data.safety.actionCeiling,'L2');assert.equal(data.safety.financialExecution,false);assert.equal(data.safety.aiWriteEnabled,false);
  assert.ok(DB.calls.some(call=>call.kind==='run'&&/UPDATE personal_finance_service_config/.test(call.sql)));assert.ok(DB.calls.some(call=>call.kind==='run'&&/personal_finance_service_control_audit/.test(call.sql)));
});

test('even elevated super admin cannot unlock financial execution or AI writes',async()=>{
  const DB=fakeDb();for(const payload of [{financialExecution:true},{aiWriteEnabled:true},{actionCeiling:'L4'},{personalDataAdminReadable:true}]){const response=await withFetch({elevated:true},()=>worker.fetch(new Request('https://personal-finance-api.ekodi.kr/api/admin/personal-finance/control',{method:'PUT',headers:adminHeaders,body:JSON.stringify(payload)}),env(DB)));assert.equal(response.status,400);assert.equal((await response.json()).code,'PF_CONTROL_LOCKED_POLICY')}
});

test('paused service blocks member API before creating a personal profile',async()=>{
  const DB=fakeDb({config:{service_enabled:0}});const response=await withFetch({user:true},()=>worker.fetch(new Request('https://personal-finance-api.ekodi.kr/api/finance/personal/summary',{headers:userHeaders}),env(DB)));
  assert.equal(response.status,503);assert.equal((await response.json()).code,'PF_SERVICE_PAUSED');assert.equal(DB.calls.some(call=>call.kind==='run'&&/personal_finance_profiles/.test(call.sql)),false);
});
test('bounded feature flags block manual entry, file import and planning independently',async()=>{
  const cases=[
    [{manual_entry_enabled:0},'/api/finance/personal/accounts','POST',{accountType:'BANK'},'PF_MANUAL_ENTRY_DISABLED'],
    [{file_import_enabled:0},'/api/finance/personal/import/preview','POST',{accountId:'x',rows:[{}]},'PF_IMPORT_DISABLED'],
    [{planning_enabled:0},'/api/finance/personal/safe-to-spend','GET',null,'PF_PLANNING_DISABLED'],
  ];
  for(const [config,path,method,payload,code] of cases){const DB=fakeDb({config});const response=await withFetch({user:true},()=>worker.fetch(new Request(`https://personal-finance-api.ekodi.kr${path}`,{method,headers:userHeaders,...(payload?{body:JSON.stringify(payload)}:{})}),env(DB)));assert.equal(response.status,503,path);assert.equal((await response.json()).code,code,path);assert.equal(DB.calls.some(call=>call.kind==='run'&&/personal_finance_profiles/.test(call.sql)),false,path)}
});

test('central admin token is never accepted as a My EKODI personal-ledger token',async()=>{
  const DB=fakeDb();const response=await withFetch({user:false},()=>worker.fetch(new Request('https://personal-finance-api.ekodi.kr/api/finance/personal/summary',{headers:adminHeaders}),env(DB)));
  assert.equal(response.status,401);assert.equal((await response.json()).code,'PF_AUTH_REQUIRED');
});

test('service-control migration is additive and has no personal-profile foreign key',()=>{
  const sql=fs.readFileSync(new URL('../personal-finance-migrations/0004_personal_finance_service_control.sql',import.meta.url),'utf8');
  assert.match(sql,/CREATE TABLE IF NOT EXISTS personal_finance_service_config/);assert.match(sql,/CREATE TABLE IF NOT EXISTS personal_finance_service_control_audit/);assert.doesNotMatch(sql,/REFERENCES personal_finance_profiles/i);assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM personal_finance_/i);
});
test('Admin navigation classifies Personal Finance under the v8 professional-services domain',()=>{
  const registry=fs.readFileSync(new URL('../admin-menu-registry.js',import.meta.url),'utf8');const loader=fs.readFileSync(new URL('../admin-demand-loader.js',import.meta.url),'utf8');
  assert.match(registry,/id: 'personal-finance'[\s\S]*group: 'vertical'[\s\S]*managementArea: 'professional-services'/);assert.match(loader,/'personal-finance':[\s\S]*personal-finance-admin\.css[\s\S]*personal-finance-admin\.js/);
  assert.equal(PERSONAL_FINANCE_ADMIN_CONTROL_CONTRACT.managementArea,'professional-services');assert.equal(PERSONAL_FINANCE_ADMIN_CONTROL_CONTRACT.personalDataAdminReadable,false);
});

test('Personal Finance admin UI manages policy only and never calls personal ledger endpoints',()=>{
  const ui=fs.readFileSync(new URL('../personal-finance-admin.js',import.meta.url),'utf8');const build=fs.readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');const workerSource=fs.readFileSync(new URL('../site-worker.js',import.meta.url),'utf8');
  assert.match(ui,/api\/admin\/personal-finance\/control/);assert.match(ui,/전문서비스 · PERSONAL FINANCE/);assert.match(ui,/개인 금융원장의 내용은 이 화면에서 조회하지 않습니다/);assert.match(ui,/EKODIAdminContext\?\.elevate/);
  assert.doesNotMatch(ui,/api\/finance\/personal\/(?:accounts|transactions|summary|goals|budgets|recurring)/);
  assert.match(build,/personal-finance-admin\.css/);assert.match(build,/personal-finance-admin\.js/);assert.match(workerSource,/personal-finance-api\.ekodi\.kr/);assert.match(workerSource,/personal-finance-admin\.js/);
});


test('Personal Finance admin assets are asset-first and candidate-only in the guarded release contract',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  for(const suffix of ['personal-finance-admin.js?pf=v1','personal-finance-admin.css?pf=v1']){
    const probe=manifest.worker.requests.find(item=>item.url.endsWith(suffix));
    assert.ok(probe,suffix);
    assert.equal(probe.rollbackVerify,false,suffix);
    assert.deepEqual(probe.headerExpect,['x-content-type-options: nosniff'],suffix);
    assert.equal(probe.headerExpect.some(value=>value.startsWith('x-ekodi-route:')),false,suffix);
  }
});
