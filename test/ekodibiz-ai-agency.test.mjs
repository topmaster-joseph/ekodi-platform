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
    __storage:data,
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
const form = {type:'individual',months:4,provider:'Example AI Provider',service:'Individual subscription',
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
  // Explicit staging profile can expose only its public client key after quote consent.
  Object.assign(env, {
    PAYMENTS_ENABLED:'true', AGENCY_PG_SCOPE_VERIFIED:'true',
    TOSS_CLIENT_KEY:'test_gck_ai_agency_test_only',
    TOSS_SECRET_KEY:'test_gsk_ai_agency_test_only'
  });
  const approvedCheckout=await request(env,'/api/agency/checkout',receipt);
  assert.equal(approvedCheckout.status,200);
  assert.equal(approvedCheckout.body.amount,25000);
  assert.equal(approvedCheckout.body.clientKey,'test_gck_ai_agency_test_only');
  assert.equal(approvedCheckout.body.secretKey,undefined);
});
test('institution term is user-chosen; supplier collections require explicit authorization', async () => {
  const env=environment();
  const submitted=await request(env,'/api/agency/apply',{...form,type:'institution',organization:'Test University',months:7});
  assert.equal(submitted.status,201);
  assert.equal(submitted.body.months,7);
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


test('service clock starts only after verified supplier activation', async () => {
  const env=environment();
  const applied=await request(env,'/api/agency/apply',{...form,email:'clock@example.test'});
  const receipt={id:applied.body.id,receiptToken:applied.body.receiptToken};
  await request(env,'/api/agency/admin/quote',{id:receipt.id,feeAmount:12000,supplierAmount:0},adminKey);
  await request(env,'/api/agency/accept',{...receipt,accepted:true});
  const internalReq=new Request('https://revenue-store.internal/agency/settle',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({id:receipt.id,paymentKey:'test-payment-key',totalAmount:12000})
  });
  const internalResult=await agencyStore(internalReq,env.__storage);
  assert.equal(internalResult.status,200);
  const before=await request(env,'/api/agency/status',receipt);
  assert.equal(before.body.record.status,'paid_pending_fulfillment');
  assert.equal(before.body.record.expiresAt,null);
  const activated=await request(env,'/api/agency/admin/activate',{id:receipt.id,confirmed:true},adminKey);
  assert.equal(activated.status,200);
  assert.equal(activated.body.record.status,'active');
  assert.ok(Date.parse(activated.body.record.expiresAt)>Date.parse(activated.body.record.activatedAt));
  const stored=await env.__storage.get('agency:'+receipt.id);
  stored.expiresAt=new Date(Date.now()-1000).toISOString();
  await env.__storage.put('agency:'+receipt.id,stored);
  const sweep=new Request('https://revenue-store.internal/agency/expire',{
    method:'POST',headers:{'content-type':'application/json'},body:'{}'
  });
  const ended=await agencyStore(sweep,env.__storage);
  assert.equal((await ended.json()).expired,1);
  const expired=await request(env,'/api/agency/status',receipt);
  assert.equal(expired.body.record.status,'expired');
});
test('intake limits repeated submissions per email per day',async()=>{
  const env=environment();
  for(let i=0;i<3;i++){
    const applied=await request(env,'/api/agency/apply',{...form,email:'limited@example.test'});
    assert.equal(applied.status,201);
  }
  const denied=await request(env,'/api/agency/apply',{...form,email:'limited@example.test'});
  assert.equal(denied.status,429);
});


test('month term is required, integral and bounded for both contract types',async()=>{
  const env=environment();
  for(const months of [undefined,null,0,-1,1.5,'12',121,Infinity]){
    const bad=await request(env,'/api/agency/apply',{...form,months,email:'months-invalid@example.test'});
    assert.equal(bad.status,422,String(months));
  }
  for(const months of [1,6,12,120]){
    const applied=await request(env,'/api/agency/apply',{...form,months,email:'months-valid-'+months+'@example.test'});
    assert.equal(applied.status,201);
    assert.equal(applied.body.months,months);
    const status=await request(env,'/api/agency/status',{id:applied.body.id,receiptToken:applied.body.receiptToken});
    assert.equal(status.body.record.months,months);
    assert.equal(status.body.campus.periods.length,months);
  }
  const healthUrl=new URL('https://ekodi.kr/ekodibiz/api/agency/health');
  const health=await agencyApi(new Request(healthUrl),healthUrl,env);
  assert.equal((await health.json()).maxMonths,120);
});

test('chosen 6-month contract expires six months after verified activation',async()=>{
  const env=environment();
  const applied=await request(env,'/api/agency/apply',{...form,months:6,email:'sixmonth@example.test'});
  const receipt={id:applied.body.id,receiptToken:applied.body.receiptToken};
  await request(env,'/api/agency/admin/quote',{id:receipt.id,feeAmount:12000,supplierAmount:0},adminKey);
  await request(env,'/api/agency/accept',{...receipt,accepted:true});
  await agencyStore(new Request('https://revenue-store.internal/agency/settle',{method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({id:receipt.id,paymentKey:'synthetic-payment',totalAmount:12000})}),env.__storage);
  const activated=await request(env,'/api/agency/admin/activate',{id:receipt.id,confirmed:true},adminKey);
  assert.equal(activated.status,200);
  const start=new Date(activated.body.record.activatedAt);
  const end=new Date(activated.body.record.expiresAt);
  const expected=new Date(start);const day=expected.getUTCDate();expected.setUTCDate(1);
  expected.setUTCMonth(expected.getUTCMonth()+6);
  const last=new Date(Date.UTC(expected.getUTCFullYear(),expected.getUTCMonth()+1,0)).getUTCDate();
  expected.setUTCDate(Math.min(day,last));
  assert.equal(end.toISOString(),expected.toISOString());
});
