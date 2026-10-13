import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import board from '../services/independent-board/worker.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const authSource=await read('auth-site/auth.js');
const accessSource=await read('supabase/functions/access-api/index.ts');

function clientTarget(site,returnTo){
  const first=authSource.indexOf('const services='),last=authSource.indexOf('const sb=createClient');
  assert.ok(first>=0&&last>first,'real login routing initializer must be found');
  const params=new URLSearchParams({site,return_to:returnTo});
  const script=authSource.slice(first,last)+'\n({site,returnTo})';
  return runInNewContext(script,{URL,URLSearchParams,location:{search:'?'+params.toString()}});
}
function serverTarget(site,returnTo){
  const first=accessSource.indexOf('function validHandoff('),last=accessSource.indexOf('function tenantSlugBase(',first);
  assert.ok(first>=0&&last>first,'real server allowlist implementation must be found');
  const raw=accessSource.slice(first,last).replace('site:string,raw:string','site,raw').replace('const origins:Record<string,string[]>','const origins');
  const fn=runInNewContext(raw+'\nvalidHandoff',{URL,validMarketingOrigin:()=>false});
  return fn(site,returnTo);
}
function accepted(site,returnTo){
  const client=clientTarget(site,returnTo);
  assert.equal(client.site,'seonammedi','SeonamMedi intent must never route as portal');
  assert.equal(client.returnTo,returnTo,'Google login must preserve requested board URL');
  assert.equal(serverTarget(client.site,client.returnTo),returnTo,'server and client handoff allowlist must agree');
}

test('dedicated and legacy portal Google logins both preserve SeonamMedi voice compose return',()=>{
  const dest='https://seonammedi.kr/board/voices?compose=1';
  accepted('seonammedi',dest);
  accepted('portal',dest);
});

test('SeonamMedi legacy host, www, and canonical EKODI board mount preserve intent',()=>{
  for(const dest of [
    'https://www.seonammedi.kr/board/voices?compose=1',
    'https://ekodi.kr/seonammedi/board/voices?compose=1',
    'https://seonammedi.kr/board/notices',
    'https://seonammedi.kr/board/finance',
  ])accepted('seonammedi',dest);
});

test('unrelated portal logins remain portal instead of being hijacked by board handoff',()=>{
  const result=clientTarget('portal','https://ekodi.kr');
  assert.equal(result.site,'portal');
  assert.equal(result.returnTo,'https://ekodi.kr/');
});

test('server never issues cross-site handoff on untrusted domain or unsafe EKODI path',()=>{
  for(const url of [
    'https://malicious.invalid/board/voices',
    'http://seonammedi.kr/board/voices',
    'https://user:pass@seonammedi.kr/board/voices',
    'https://ekodi.kr/admin/control',
    'https://ekodi.kr/ekodimall',
  ]){
    assert.equal(serverTarget('seonammedi',url),null,'reject '+url);
  }
});

test('browser voice login uses SeonamMedi service identity and preserves compose intent',async()=>{
  const response=await board.fetch(new Request('https://seonammedi.kr/board/voices'),{});
  const html=await response.text();
  assert.equal(response.status,200);
  assert.match(html,/auth.searchParams.set\("site","seonammedi"\)/);
  assert.doesNotMatch(html,/auth.searchParams.set\("site","portal"\)/);
  assert.match(html,/auth.searchParams.set\("return_to",target.href\)/);
  assert.match(html,/target.searchParams.set\("compose","1"\)/);
  assert.match(html,/history.replaceState\(null,"",location.pathname\+location.search\)/);
});

test('client rejects unknown return origin for SeonamMedi identity',()=>{
  const result=clientTarget('seonammedi','https://malicious.invalid/redirect');
  assert.equal(result.site,'seonammedi');
  assert.equal(result.returnTo,'https://seonammedi.kr/board/voices');
  assert.equal(serverTarget('seonammedi',result.returnTo),result.returnTo);
});
