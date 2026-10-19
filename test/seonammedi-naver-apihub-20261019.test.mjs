import test from 'node:test';
import assert from 'node:assert/strict';
import {naverSearchRequest} from '../seonammedi-monitor.js';

// Naver Developers stopped issuing new Search API keys on 2026-07-31; new keys
// come from NAVER API HUB (NAVER Cloud) with NCP gateway headers.
const env={NAVER_CLIENT_ID:'id',NAVER_CLIENT_SECRET:'secret'};

test('API HUB is tried first with NCP gateway headers',async()=>{
  const calls=[];
  const res=await naverSearchRequest(env,'news','서남권 국립의대',{fetchImpl:async(url,o)=>{calls.push({url,h:o.headers});return Response.json({items:[]})}});
  assert.equal(res.status,200);
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/^https:\/\/naverapihub\.apigw\.ntruss\.com\/search\/v1\/news\?query=/);
  assert.equal(calls[0].h['X-NCP-APIGW-API-KEY-ID'],'id');
  assert.equal(calls[0].h['X-NCP-APIGW-API-KEY'],'secret');
});

test('legacy developers.naver.com keys fall back to the old endpoint',async()=>{
  const calls=[];
  await naverSearchRequest(env,'blog','q',{fetchImpl:async(url,o)=>{calls.push({url,h:o.headers});return calls.length===1?new Response('',{status:401}):Response.json({items:[]})}});
  assert.match(calls[1].url,/^https:\/\/openapi\.naver\.com\/v1\/search\/blog\.json\?/);
  assert.equal(calls[1].h['X-Naver-Client-Id'],'id');
});

test('rate limits are not retried against the legacy endpoint',async()=>{
  let n=0;
  await assert.rejects(naverSearchRequest(env,'news','q',{fetchImpl:async()=>{n++;return new Response('',{status:429})}}),/Naver news HTTP 429/);
  assert.equal(n,1);
});
