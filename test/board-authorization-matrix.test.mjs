import test from 'node:test';
import assert from 'node:assert/strict';
import {manifest,validateMatrix,validateRegistryCoverage,probeAnonymousMatrix} from '../scripts/audit-board-authorization.mjs';

test('registered canonical board surfaces have anonymous denial probes',()=>{
  assert.deepEqual(validateMatrix(),[]);
  assert.ok(manifest.boards.length>=7);
  assert.ok(manifest.contractOnly.some(x=>x.id==='seonammedi.finance.comments'));
});

test('anonymous probes reject POST, reply, edit, delete, and management on every declared board',async()=>{
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url:String(url),method:options.method});
    return new Response('{}',{status:options.method==='GET'&&(String(url).endsWith('/health')||String(url).endsWith('/api/health'))?200:401});
  };
  const result=await probeAnonymousMatrix({fetcher,pause:async()=>{}});
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(result.fullyVerified,false,'anonymous-only proof must never be called full verification');
  assert.equal(result.authenticatedManagerVerified,false);
  assert.ok(calls.length>30);
  assert.equal(calls.filter(x=>x.method==='POST').length,manifest.boards.reduce((n,b)=>n+b.deny.filter(x=>x.method==='POST').length,0));
});

test('anonymous 2xx writes, missing routes and rate limits fail closed',async()=>{
  for(const bad of [201,404,429]){
    const result=await probeAnonymousMatrix({fetcher:async(url,options)=>new Response('{}',{status: options.method==='GET'&&/\/health$/.test(String(url))?200:bad}),pause:async()=>{}});
    assert.equal(result.ok,false,String(bad));
    assert.ok(result.errors.some(x=>x.includes('anonymous-write-not-denied')));
  }
});

test('no prefilled body, existing record, bearer, or login cookie can be sent by the probe',async()=>{
  const result=await probeAnonymousMatrix({fetcher:async(url,options)=>{
    assert.equal(options.headers.authorization,undefined);
    assert.equal(options.headers.cookie,undefined);
    if(options.method!=='GET'){
      assert.equal(options.body,'{}');
      assert.match(String(url),/\/0(?:\/|$)|\/api\/(?:posts|admin\/(?:posts|finance|notices))$/);
    }
    return new Response('{}',{status:options.method==='GET'&&/\/health$/.test(String(url))?200:403});
  },pause:async()=>{}});
  assert.equal(result.ok,true,JSON.stringify(result.errors));
});

test('future boards in source or browser registry cannot silently escape coverage',()=>{
  const registered={verifiedIndependentSurfaces:[{id:'cgma.board'},{id:'future-site.board'}]};
  const browser={surfaces:[{id:'journal.posts',kind:'board',enabled:true},{id:'community.board',kind:'board',enabled:false}]};
  assert.deepEqual(validateRegistryCoverage(manifest,registered,browser),['unregistered-live-board:future-site.board']);
});
