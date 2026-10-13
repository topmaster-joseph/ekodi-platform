
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCloudflareSecretControl } from '../cloudflare-secret-control.js';

const baseUrl='https://ekodi.kr/api/control/secrets/actions';
function envFor({role='super_admin',email='owner@example.test',credential='synthetic-test-token'}={}) {
  const auditRows=[];
  const db={
    prepare(sql) {
      if (/FROM sessions/.test(sql)) return {
        bind(){return {first:async()=>({email,role,expires_at:'2099-01-01T00:00:00.000Z'})};},
      };
      if (/INSERT INTO cloudflare_secret_audit/.test(sql)) return {
        bind(...args){return {run:async()=>{auditRows.push(args);return {success:true};}};},
      };
      throw new Error('unexpected D1 query');
    },
  };
  return {DB:db,ADMIN_EMAIL:'owner@example.test',GITHUB_ACTIONS_DISPATCH_TOKEN:credential,auditRows};
}
function req(path=baseUrl,{body,authorized=true,confirmed=true,method=body?'POST':'GET'}={}) {
  const headers=new Headers();
  if(authorized)headers.set('authorization','Bearer synthetic-central-session');
  if(confirmed)headers.set('x-ekodi-confirm-impact','github-workflow-dispatch');
  if(body)headers.set('content-type','application/json');
  return new Request(path,{method,headers,body:body?JSON.stringify(body):undefined});
}
async function call(env, request){const response=await handleCloudflareSecretControl(request,env);return {status:response.status,body:await response.json()};}

test('anonymous and non-super-admin action control never dispatches',async()=>{
  const previous=globalThis.fetch;
  let count=0;
  globalThis.fetch=async()=>{count++;throw new Error('unexpected external call')};
  try {
    assert.equal((await call(envFor(),req(baseUrl,{authorized:false}))).status,401);
    assert.equal((await call(envFor({role:'viewer'}),req())).status,403);
    assert.equal((await call(envFor({email:'unauthorized@example.test'}),req())).status,403);
    assert.equal(count,0);
  } finally {globalThis.fetch=previous;}
});

test('no actions credential, missing approval, arbitrary workflows and branch arguments are rejected',async()=>{
  const previous=globalThis.fetch;
  let count=0;
  globalThis.fetch=async()=>{count++;throw new Error('unexpected external call')};
  try {
    const missing=envFor({credential:''});
    assert.equal((await call(missing,req())).body.configured,false);
    assert.equal((await call(missing,req(baseUrl+'/dispatch',{body:{workflow:'traffic-intelligence-analytics.yml'}}))).status,503);
    const e=envFor();
    assert.equal((await call(e,req(baseUrl+'/dispatch',{body:{workflow:'traffic-intelligence-analytics.yml'},confirmed:false}))).status,428);
    assert.equal((await call(e,req(baseUrl+'/dispatch',{body:{workflow:'deploy.yml'}}))).status,403);
    assert.equal((await call(e,req(baseUrl+'/dispatch',{body:{workflow:'traffic-intelligence-analytics.yml',ref:'unsafe'}}))).status,403);
    assert.equal(count,0);
  } finally {globalThis.fetch=previous;}
});

test('accepted 204 dispatch uses main and remains queued-unverified',async()=>{
  const previous=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(null,{status:204});};
  try {
    const env=envFor();
    const result=await call(env,req(baseUrl+'/dispatch',{body:{workflow:'cloudflare-production-usage-diagnose.yml'}}));
    assert.equal(result.status,202);
    assert.equal(result.body.accepted,true);
    assert.equal(result.body.status,'queued-unverified');
    assert.equal(result.body.ref,'main');
    assert.equal(calls.length,1);
    assert.match(calls[0].url,/\/actions\/workflows\/cloudflare-production-usage-diagnose\.yml\/dispatches$/);
    assert.deepEqual(JSON.parse(calls[0].options.body),{ref:'main'});
    assert.equal(calls[0].options.headers.authorization,'Bearer synthetic-test-token');
    assert.equal(env.auditRows.length,1);
  } finally {globalThis.fetch=previous;}
});

test('GitHub refusal does not report successful dispatch or escalate permissions',async()=>{
  const previous=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response('{}',{status:403,headers:{'content-type':'application/json'}});};
  try {
    const result=await call(envFor(),req(baseUrl+'/dispatch',{body:{workflow:'traffic-intelligence-analytics.yml'}}));
    assert.equal(result.status,502);
    assert.equal(result.body.code,'ACTIONS_DISPATCH_REJECTED');
    assert.equal(result.body.accepted,undefined);
    assert.equal(calls.length,1);
  } finally {globalThis.fetch=previous;}
});
