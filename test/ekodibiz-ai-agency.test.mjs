import test from 'node:test';
import assert from 'node:assert/strict';
import { agencyApi, agencyStore } from '../ekodibiz-ai-agency.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  async get(k) { return this.values.get(k); }
  async put(k,v) { this.values.set(k,structuredClone(v)); }
  async list({prefix}) { return new Map([...this.values].filter(([key]) => key.startsWith(prefix))); }
}
function environment() {
  const data = new MemoryStorage();
  return {
    AGENCY_ADMIN_KEY:'dev-authorization-key-32-characters-minimum-only',
    REVENUE_STORE: {
      idFromName: (name) => name,
      get: () => ({ fetch: async (url, init) => agencyStore(new Request(url, init), data) })
    }
  };
}
async function request(env, path, body={}, key='') {
  const url = new URL('https://ekodi.kr/ekodibiz' + path);
  const req = new Request(url, { method:'POST',
    headers:{'content-type':'application/json',...(key ? {'x-ekodibiz-agency-admin':key} : {})},
    body:JSON.stringify(body) });
  const response = await agencyApi(req, url, env);
  return { status:response.status, body:await response.json() };
}
const form = {type:'individual',provider:'Example AI Provider',service:'Individual subscription',
  customer:'Test User',email:'test@example.test',organization:'',
  description:'Buy an authorized subscription',consent:true,terms:true};
const adminKey='dev-authorization-key-32-characters-minimum-only';

test('application intake validates consent and forbids collecting credentials', async () => {
  const env = environment();
  const bad = await request(env,'/api/agency/apply',{...form,terms:false});
  assert.equal(bad.status,422);
  const credential = await request(env,'/api/agency/apply',{...form,password:'not_allowed'});
  assert.equal(credential.status,422);
  const missingOrg = await request(env,'/api/agency/apply',{...form,type:'institution'});
  assert.equal(missingOrg.status,422);
});
test('anonymous receipt tokens isolate requests and quote amount cannot be forged by user', async () => {
  const env = environment();
  const submitted=await request(env,'/api/agency/apply',{...form,feeAmount:1,supplierAmount:0});
  assert.equal(submitted.status,201);
  assert.match(submitted.body.id,/^EBAI-[A-Z0-9]{24}$/);
  assert.ok(submitted.body.receiptToken.length>60);
  const receipt={id:submitted.body.id,receiptToken:submitted.body.receiptToken};
  const status=await request(env,'/api/agency/status',receipt);
  assert.equal(status.body.record.status,'awaiting_quote');
  assert.equal(status.body.record.feeAmount,null);
  assert.equal(status.body.record.email,undefined);
  const invalid=await request(env,'/api/agency/status',{...receipt,receiptToken:'wrong'});
  assert.equal(invalid.status,404);
  const tooSoon=await request(env,'/api/agency/accept',{...receipt,accepted:true});
  assert.equal(tooSoon.status,409);
  const directPay=await request(env,'/api/agency/checkout',receipt);
  assert.equal(directPay.status,409);
  const adminDenied=await request(env,'/api/agency/admin/list');
  assert.equal(adminDenied.status,403);
  const adminList=await request(env,'/api/agency/admin/list',{},adminKey);
  assert.equal(adminList.body.items.length,1);
  assert.equal(adminList.body.items[0].email,form.email);
  const quote=await request(env,'/api/agency/admin/quote',
    {id:receipt.id,feeAmount:25000,supplierAmount:0,guidance:'Service fee only'},adminKey);
  assert.equal(quote.status,200);
  assert.equal(quote.body.record.totalAmount,25000);
  const accepted=await request(env,'/api/agency/accept',{...receipt,accepted:true});
  assert.equal(accepted.status,200);
  assert.equal(accepted.body.record.status,'accepted');
  const payment=await request(env,'/api/agency/checkout',receipt);
  assert.equal(payment.status,503);
  assert.equal(payment.body.error,'pg_or_supplier_scope_not_enabled');
});
test('institution plan is fixed at three months; supplier collections require explicit authorization', async () => {
  const env=environment();
  const submitted=await request(env,'/api/agency/apply',{...form,type:'institution',organization:'Test University'});
  assert.equal(submitted.status,201);
  assert.equal(submitted.body.months,3);
  const denied=await request(env,'/api/agency/admin/quote',
    {id:submitted.body.id,feeAmount:30000,supplierAmount:50000},adminKey);
  assert.equal(denied.status,422);
  const allowed=await request(env,'/api/agency/admin/quote',
    {id:submitted.body.id,feeAmount:30000,supplierAmount:0},adminKey);
  assert.equal(allowed.status,200);
});
test('wrong-origin submission is rejected and health is read-only',async()=>{
  const env=environment();
  const url=new URL('https://ekodi.kr/ekodibiz/api/agency/apply');
  const req=new Request(url,{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},
    body:JSON.stringify(form)});
  const blocked=await agencyApi(req,url,env);
  assert.equal(blocked.status,403);
  const healthUrl=new URL('https://ekodi.kr/ekodibiz/api/agency/health');
  const health=await agencyApi(new Request(healthUrl),healthUrl,env);
  assert.equal((await health.json()).realPaymentsEnabled,false);
});
