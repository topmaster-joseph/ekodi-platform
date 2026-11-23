import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAgencyAdminAliasLive } from '../scripts/verify-ekodibiz-agency-admin-alias-live.mjs';

const CANONICAL='https://ekodi.kr/ekodibiz/ai-agency/manage';
test('legacy admin live proof uses only synthetic GET/HEAD and demands sanitized redirects',async()=>{
  const calls=[];
  const result=await verifyAgencyAdminAliasLive({fetchImpl:async(url,options)=>{
    calls.push({url,options});
    return new Response(null,{status:308,headers:{
      location:CANONICAL,'cache-control':'no-store','x-robots-tag':'noindex, nofollow'
    }});
  }});
  assert.equal(result.ok,true);
  assert.equal(result.legacyAgencyAdminRedirects,4);
  assert.equal(calls.length,4);
  assert.deepEqual([...new Set(calls.map(x=>x.options.method))],['GET','HEAD']);
  assert.ok(calls.every(x=>x.options.redirect==='manual'));
  assert.ok(calls.every(x=>x.url.includes('SYNTHETIC-NEVER-ISSUED')));
});
test('legacy alias canary catches generic admin hijack and query leakage',async()=>{
  await assert.rejects(()=>verifyAgencyAdminAliasLive({fetchImpl:async()=>new Response('Workspace Admin',{status:200})}),
    /permanently redirect before workspace admin/);
  await assert.rejects(()=>verifyAgencyAdminAliasLive({fetchImpl:async()=>new Response(null,{
    status:308,headers:{location:CANONICAL+'?receiptToken=SYNTHETIC-NEVER-ISSUED',
      'cache-control':'no-store','x-robots-tag':'noindex'}})}),/without exposing query parameters/);
});
