import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {agencyApi,agencyStore,agencyIntakeOperatorNotice,notifyAgencyIntake} from '../ekodibiz-ai-agency.js';
import './support-cloudflare-workers-stub.mjs';
const {normalizeNotice}=await import('../operator-notify.js');

const form={type:'institution',months:3,provider:'Provider Test',service:'Subscription Test',
  customer:'Private Customer Name',email:'private.customer@example.test',organization:'Private Organization',
  description:'Private note',consent:true,terms:true};
function envFor(submit){
  const records=new Map();
  const storage={
    get:async key=>records.get(key),
    put:async(key,value)=>records.set(key,value),
    list:async({prefix})=>new Map([...records].filter(([key])=>key.startsWith(prefix)))
  };
  return {
    AGENCY_OPERATOR_NOTIFY_ENABLED:'true',
    OPERATOR_NOTIFY:{notify:submit},
    REVENUE_STORE:{idFromName:name=>name,get:()=>({fetch:(url,opts)=>agencyStore(new Request(url,opts),storage)})},
    records
  };
}
async function apply(env,ctx,body=form){
  const url=new URL('https://ekodi.kr/ekodibiz/api/agency/apply');
  const response=await agencyApi(new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),url,env,ctx);
  return {status:response.status,body:await response.json()};
}
test('private operator notice excludes customer data, receipt tokens, provider and account details',()=>{
  const notice=agencyIntakeOperatorNotice({...form,id:'EBAI-PRIVATE-ID',receiptToken:'DO-NOT-LEAK'});
  const normalized=normalizeNotice(notice);
  assert.equal(normalized.error,undefined);
  assert.equal(normalized.source,'agency');
  assert.equal(normalized.link,'https://ekodi.kr/ekodibiz/ai-agency/manage');
  const raw=JSON.stringify(notice);
  for(const secret of [form.customer,form.email,form.organization,form.provider,form.description,'EBAI-PRIVATE-ID','DO-NOT-LEAK'])
    assert.equal(raw.includes(secret),false);
});
test('only persisted and validated applications dispatch to private operator, response is not blocked',async()=>{
  const notices=[],background=[];
  const env=envFor(async notice=>{notices.push(notice);return {ok:true}});
  const ctx={waitUntil:p=>background.push(p)};
  assert.equal((await apply(env,ctx,{...form,consent:false})).status,422);
  assert.equal(notices.length,0);
  const result=await apply(env,ctx);
  assert.equal(result.status,201);
  assert.match(result.body.id,/^EBAI-/);
  assert.equal(background.length,1);
  await Promise.all(background);
  assert.equal(notices.length,1);
  assert.equal(notices[0].source,'agency');
  assert.equal(env.records.has('agency:'+result.body.id),true);
});
test('notification binding failure cannot lose persisted contract, and staging stays silent',async()=>{
  const failing=envFor(async()=>{throw new Error('no push device')});
  const created=await apply(failing);
  assert.equal(created.status,201);
  assert.equal(failing.records.has('agency:'+created.body.id),true);
  const staging=envFor(async()=>{throw Error('must not call');});
  staging.AGENCY_OPERATOR_NOTIFY_ENABLED='false';
  const quiet=await apply(staging);
  assert.equal(quiet.status,201);
  assert.equal((await notifyAgencyIntake(staging,{type:'individual'})).code,'AGENCY_NOTICE_DISABLED');
});
test('operator RPC binding is only enabled for real revenue worker, staging is explicitly off',()=>{
  const prod=readFileSync(new URL('../wrangler.ekodibiz.toml',import.meta.url),'utf8');
  const stage=readFileSync(new URL('../wrangler.ekodibiz-staging.toml',import.meta.url),'utf8');
  const api=readFileSync(new URL('../ekodibiz-worker.js',import.meta.url),'utf8');
  assert.match(prod,/AGENCY_OPERATOR_NOTIFY_ENABLED = "true"/);
  assert.match(prod,/\[\[services\]\]\s*binding = "OPERATOR_NOTIFY"\s*service = "ekodi-auth-api"\s*entrypoint = "OperatorNotifier"/);
  assert.match(stage,/AGENCY_OPERATOR_NOTIFY_ENABLED = "false"/);
  assert.doesNotMatch(stage,/binding = "OPERATOR_NOTIFY"/);
  assert.match(api,/return agencyApi\(request, url, env, ctx\)/);
});
