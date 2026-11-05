import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publisherDbId,summarizeD1Result,auditJubileeProduction} from '../scripts/jubilee-publishing-d1-readonly-audit.mjs';
const UUID='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const env={
  CLOUDFLARE_API_TOKEN:'test-readonly-token-example',
  CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),
  PUBLISHING_JUBILEE_AUTHOR_USER_ID:UUID,
};
const toml=readFileSync(new URL('../wrangler.publishing.toml',import.meta.url),'utf8');
const response=(v1,v2)=>({success:true,result:[{success:true,
  meta:{changed_db:false},results:[{volume1_count:v1||null,volume2_count:v2||null,total_count:v1+v2}]}]});
test('publisher D1 binding is discovered from config and never hardcodes an owner',()=>{
  assert.match(publisherDbId(toml),/^[0-9a-f-]{36}$/);
  assert.throws(()=>publisherDbId('[vars]\nxyz=true'),/PUBLISHING_DB_CONFIG_UNAVAILABLE/);
});
test('two existing projects are confirmed only when one exact title per owner exists',()=>{
  const a=summarizeD1Result(response(1,1));
  assert.deepEqual({first:a.volume1Count,second:a.volume2Count,ready:a.twoProjectsConfirmed},
    {first:1,second:1,ready:true});
  assert.equal(a.publicSaleAuthorized,false);
  assert.equal(summarizeD1Result(response(0,0)).state,'project-registration-required');
  assert.equal(summarizeD1Result(response(1,0)).state,'project-registration-required');
  assert.equal(summarizeD1Result(response(2,1)).state,'duplicate-projects-investigate');
});
test('only SELECT with bound private owner and no stdout identifiers is used',async()=>{
  const calls=[];
  const fake=async(url,request)=>{
    calls.push({url,request});
    return {ok:true,async json(){return response(1,0);}};
  };
  const info=await auditJubileeProduction({env,fetchImpl:fake,toml});
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/\/d1\/database\//);
  const x=JSON.parse(calls[0].request.body);
  assert.match(x.sql,/^SELECT\s/);
  assert.doesNotMatch(x.sql,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|ATTACH)\b/i);
  assert.equal(x.params[2],UUID);
  assert.equal(x.params.length,5);
  assert.doesNotMatch(JSON.stringify(info),new RegExp(UUID,'i'));
  assert.doesNotMatch(JSON.stringify(info),/token|userId|email|projectId/i);
});
test('unverified credentials, response shape, or modification flags fail closed',async()=>{
  await assert.rejects(auditJubileeProduction({env:{...env,PUBLISHING_JUBILEE_AUTHOR_USER_ID:'x'},toml,
    fetchImpl:()=>{throw Error('should-not-fetch');}}),/READONLY_AUDIT_CREDENTIALS_UNAVAILABLE/);
  for(const bad of [
    {success:false,result:[]},
    {success:true,result:[]},
    {success:true,result:[{success:true,meta:{changed_db:true},results:[{volume1_count:1,volume2_count:1,total_count:2}]}]},
    {success:true,result:[{success:true,results:[{volume1_count:-1,volume2_count:0,total_count:-1}]}]},
  ])assert.throws(()=>summarizeD1Result(bad),/D1_READONLY_/);
});
test('HTTP error does not echo response body or any credential',async()=>{
  await assert.rejects(auditJubileeProduction({env,toml,
    fetchImpl:async()=>({ok:false,status:403})}),/D1_AUDIT_API_HTTP_403/);
});
