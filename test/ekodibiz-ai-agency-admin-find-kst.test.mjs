import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { agencyApi, agencyStore } from '../ekodibiz-ai-agency.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async list({prefix}) { return new Map([...this.values].filter(([key]) => key.startsWith(prefix))); }
}
const key='dev-authorization-key-32-characters-minimum-only';
function setup() {
  const storage=new MemoryStorage();
  return {storage,env:{
    AGENCY_ADMIN_KEY:key,
    REVENUE_STORE:{
      idFromName:()=> 'ekodibiz-global',
      get:()=>({fetch:async (url,init)=>agencyStore(new Request(url,init),storage)})
    }
  }};
}
async function request(env,path,body={},adminKey='') {
  const url=new URL('https://ekodi.kr/ekodibiz'+path);
  const result=await agencyApi(new Request(url,{
    method:'POST',
    headers:{'content-type':'application/json',...(adminKey?{'x-ekodibiz-agency-admin':adminKey}:{})},
    body:JSON.stringify(body)
  }),url,env);
  return {status:result.status,data:await result.json()};
}
function seed(id,issuedAt,more={}) {
  return {id,type:'institution',months:9,provider:'Test AI',service:'Test plan',
    customer:'Test Contract Manager',email:'contract@example.test',organization:'Test University',
    issuedAt,status:'active',feeAmount:2000,supplierAmount:5000,totalAmount:7000,
    tokenHash:'private-receipt-token-hash',paymentKey:'private-gateway-payment-key',
    monthlyRecords:[],audit:[{action:'private',at:issuedAt}],...more};
}

test('operator exact receipt-ID lookup can find records outside latest 100 with no secret disclosure',async()=>{
  const {storage,env}=setup();
  const older='EBAI-'+'O'.repeat(24);
  await storage.put('agency:'+older,seed(older,'2020-01-01T00:00:00.000Z'));
  for(let i=0;i<101;i++){
    const id='EBAI-'+'N'.repeat(21)+String(i).padStart(3,'0');
    await storage.put('agency:'+id,seed(id,'2026-11-12T00:00:00.000Z'));
  }
  const list=await request(env,'/api/agency/admin/list',{},key);
  assert.equal(list.status,200);
  assert.equal(list.data.items.length,100);
  assert.equal(list.data.items.some(item=>item.id===older),false);
  const unauth=await request(env,'/api/agency/admin/find',{id:older});
  assert.equal(unauth.status,403);
  const malformed=await request(env,'/api/agency/admin/find',{id:'bad'},key);
  assert.equal(malformed.status,404);
  const unknown=await request(env,'/api/agency/admin/find',{id:'EBAI-'+'Z'.repeat(24)},key);
  assert.equal(unknown.status,404);
  const found=await request(env,'/api/agency/admin/find',{id:older},key);
  assert.equal(found.status,200);
  assert.equal(found.data.record.id,older);
  assert.equal(found.data.record.months,9);
  assert.equal(found.data.record.email,'contract@example.test');
  for(const secret of ['tokenHash','paymentKey','audit','monthlyRecords']){
    assert.equal(found.data.record[secret],undefined,secret);
  }
});

test('supplier evidence permits current Seoul day and rejects future or impossible dates',async()=>{
  const {storage,env}=setup();
  const id='EBAI-'+'K'.repeat(24);
  await storage.put('agency:'+id,seed(id,'2026-11-12T00:00:00.000Z'));
  const kstToday=new Date(Date.now()+9*60*60*1000).toISOString().slice(0,10);
  const future=new Date(Date.parse(kstToday+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  const invalid=await request(env,'/api/agency/admin/record-cycle',{
    id,cycle:1,amount:750,paidOn:'2026-02-30',receiptRef:'TEST-INV-2026-001',confirmed:true
  },key);
  assert.equal(invalid.status,422);
  const tomorrow=await request(env,'/api/agency/admin/record-cycle',{
    id,cycle:1,amount:750,paidOn:future,receiptRef:'TEST-INV-2026-001',confirmed:true
  },key);
  assert.equal(tomorrow.status,422);
  const current=await request(env,'/api/agency/admin/record-cycle',{
    id,cycle:1,amount:750,paidOn:kstToday,receiptRef:'TEST-INV-2026-001',confirmed:true
  },key);
  assert.equal(current.status,200);
  const stored=await storage.get('agency:'+id);
  assert.equal(stored.monthlyRecords[0].paidOn,kstToday);
  assert.equal(stored.monthlyRecords[0].amount,750);
});

test('responsive company-admin surface exposes old-contract lookup without client-side admin key persistence',async()=>{
  const html=await readFile(new URL('../ekodibiz/ai-agency-admin.html',import.meta.url),'utf8');
  const js=await readFile(new URL('../ekodibiz/ai-agency-admin.js',import.meta.url),'utf8');
  for(const name of ['findForm','findId','findBtn'])assert.match(html,new RegExp('id="'+name+'"'));
  assert.match(html,/이전 계약/);
  assert.match(js,/call\('\/find',\{id\}\)/);
  assert.match(js,/Date\.now\(\)\+9\*60\*60\*1000/);
  assert.doesNotMatch(js,/(?:localStorage|sessionStorage)\.setItem\([^)]*adminKey/);
});
