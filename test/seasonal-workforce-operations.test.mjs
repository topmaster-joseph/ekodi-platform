import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SEASONAL_API_ROOT,isSeasonalOperationsPath,validateSeasonalSubmission,validateSeasonalReview,seasonalOperationsResponse} from '../seasonal-workforce/operations-api.mjs';

const BASE='https://ekodi.kr'+SEASONAL_API_ROOT+'/tenants/muan';
const REQUEST_ID='11111111-1111-4111-8111-111111111111';
const DEMAND_ID='22222222-2222-4222-8222-222222222222';
const demand={crop:'onion',workers:10,start_month:'2026-11',duration_months:4,housing_status:'ready',request_id:REQUEST_ID};
const auth={authorization:'Bearer valid-test-only-token'};
const resolveAdmin=async()=>({kind:'admin',email:'operator@example.test'});
const make=(suffix='',options={})=>new Request(BASE+suffix,options);
function dbWith(role='municipal_operator',state={}){
 return {
  prepare(sql){
   return {bind(...args){
    return {
     async first(){
      if(sql.includes('FROM admins'))return {id:23};
      if(sql.includes('JOIN seasonal_operator_roles'))return role?{tenant_id:'approved-tenant-1',role}:null;
      if(sql.includes('SELECT id,created_by_admin_id'))return state.previous||null;
      if(sql.includes('SELECT * FROM seasonal_farm_demands WHERE tenant_id=? AND id=?'))return state.row||null;
      return null;
     },
     async all(){
      if(sql.includes('GROUP BY status'))return {results:[{status:'submitted',count:2,workers:20,person_months:80}]};
      return {results:state.items||[]};
     },
     sql,args
    };
   }};
  },
  async batch(queries){state.batched=queries;return [{meta:{changes:state.changed??1}},{meta:{changes:1}}]}
 };
}
const env=(role='municipal_operator',state={})=>({SEASONAL_PORTAL_OPERATIONS_ENABLED:'true',DB:dbWith(role,state),PLATFORM_SENSITIVE_RATE_LIMITER:{async limit(){return {success:true}}}});

test('path router is narrowly scoped to the activated operations API',()=>{
 assert.equal(isSeasonalOperationsPath(SEASONAL_API_ROOT+'/tenants/muan/demands'),true);
 assert.equal(isSeasonalOperationsPath('/ekodibiz/other/api/v1'),false);
 assert.equal(isSeasonalOperationsPath('/ekodibiz/seasonal-workers-malicious/api/v1'),false);
});
test('input rejects extra fields, unknown roles and impossible values',()=>{
 assert.equal(validateSeasonalSubmission(demand)?.workers,10);
 for(const wrong of [{...demand,created_by_admin_id:1},{...demand,workers:'10'},{...demand,workers:0},{...demand,request_id:'bad'},null])
  assert.equal(validateSeasonalSubmission(wrong),null);
 assert.deepEqual(validateSeasonalReview({status:'under_review',version:1}),{status:'under_review',version:1});
 for(const wrong of [{status:'allocated',version:1},{status:'approved',version:0},{status:'approved',version:1,tenant_id:'muan'}])
  assert.equal(validateSeasonalReview(wrong),null);
});
test('API is fail-closed unless ops flag is explicitly enabled and DB exists',async()=>{
 assert.equal((await seasonalOperationsResponse(make('/demands'),{})).status,503);
 assert.equal((await seasonalOperationsResponse(make('/demands'),{SEASONAL_PORTAL_OPERATIONS_ENABLED:'true'})).status,503);
 assert.equal(await (await seasonalOperationsResponse(make('/demands'),{})).json().then(x=>x.error),'applications_not_enabled');
});
test('canonical origin and same-origin mutations are enforced',async()=>{
 assert.equal((await seasonalOperationsResponse(new Request('https://evil.test'+SEASONAL_API_ROOT+'/tenants/muan/demands'),env())).status,403);
 assert.equal((await seasonalOperationsResponse(make('/demands',{headers:{origin:'https://evil.test'}}),env())).status,403);
 assert.equal((await seasonalOperationsResponse(make('/demands',{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify(demand)}),env())).status,403);
 assert.equal((await seasonalOperationsResponse(make('/demands',{method:'DELETE'}),env())).status,405);
});
test('session, tenant membership and role prevent unauthorized access',async()=>{
 assert.equal((await seasonalOperationsResponse(make('/demands'),env())).status,401);
 assert.equal((await seasonalOperationsResponse(make('/demands',{headers:auth}),env(null),{resolveAdmin})).status,404);
 const wrongRole={...env('auditor')};
 const sent=make('/demands',{method:'POST',headers:{...auth,origin:'https://ekodi.kr','content-type':'application/json'},body:JSON.stringify(demand)});
 assert.equal((await seasonalOperationsResponse(sent,wrongRole,{resolveAdmin})).status,403);
});
test('registered operator may enter audited administrative demand, never allocate workers',async()=>{
 const state={};
 const response=await seasonalOperationsResponse(make('/demands',{method:'POST',headers:{...auth,origin:'https://ekodi.kr','content-type':'application/json'},body:JSON.stringify(demand)}),env('municipal_operator',state),{resolveAdmin});
 assert.equal(response.status,201);
 const body=await response.json();
 assert.equal(body.allocationConfirmed,false);
 assert.equal(body.status,'submitted');
 assert.equal(state.batched.length,2);
 assert.match(state.batched[1].sql,/seasonal_demand_audit/);
});
test('GET list and statistics are tenant filtered and redact admin IDs',async()=>{
 const state={items:[{id:DEMAND_ID,crop:'onion',workers:10,start_month:'2026-11',duration_months:4,housing_status:'ready',status:'submitted',version:1,created_by_admin_id:23}]};
 const r=await seasonalOperationsResponse(make('/demands',{headers:auth}),env('auditor',state),{resolveAdmin});
 assert.equal(r.status,200);
 const body=await r.json();assert.equal(body.items.length,1);assert.equal('created_by_admin_id' in body.items[0],false);
 const s=await seasonalOperationsResponse(make('/statistics',{headers:auth}),env('auditor',state),{resolveAdmin});
 assert.equal(s.status,200);assert.equal((await s.json()).personMonths,80);
});
test('optimistic version status review is internal only and audited',async()=>{
 const state={};
 const r=await seasonalOperationsResponse(make('/demands/'+DEMAND_ID,{method:'PATCH',headers:{...auth,origin:'https://ekodi.kr','content-type':'application/json'},body:JSON.stringify({status:'under_review',version:1})}),env('municipal_operator',state),{resolveAdmin});
 assert.equal(r.status,200);assert.equal((await r.json()).allocationConfirmed,false);
 assert.match(state.batched[0].sql,/WHERE id=\? AND tenant_id=\? AND version=\?/);
 assert.match(state.batched[1].sql,/WHERE changes\(\)=1/);
});
test('inactive schema never self-seeds privileged operator or live tenants',()=>{
 const schema=readFileSync(new URL('../schemas/ekodibiz/seasonal-workforce-inactive.sql',import.meta.url),'utf8');
 assert.match(schema,/activated INTEGER NOT NULL DEFAULT 0/);
 assert.match(schema,/active INTEGER NOT NULL DEFAULT 0/);
 assert.match(schema,/authorization_evidence_ref/);
 assert.doesNotMatch(schema,/INSERT INTO seasonal_operator_roles|INSERT INTO seasonal_tenants|DROP TABLE/i);
});
test('operations route is gated before public demo in canonical platform Worker',()=>{
 const router=readFileSync(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
 const ops=router.indexOf('if(isSeasonalOperationsPath(url.pathname))return seasonalOperationsResponse(request,env)');
 const publicRoute=router.indexOf('if(isSeasonalPortalPath(url.pathname))return seasonalPortalResponse(request)');
 assert.ok(ops>=0&&publicRoute>ops);
});
