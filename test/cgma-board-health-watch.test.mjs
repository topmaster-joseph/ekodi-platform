import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCgmaBoard, checkEndpoint } from '../scripts/monitor-cgma-board.mjs';

const headers = {'x-ekodi-board-id':'site:cgma:main','x-ekodi-board-independent':'true'};
const payloadFor = url => {
  const path = new URL(url).pathname;
  if (path.endsWith('/api/memberships')) return new Response('private', {status:403});
  if (path.endsWith('/api/health')) return Response.json({ok:true,boardId:'site:cgma:main',siteId:'cgma',independent:true,aiIndependent:true},{headers});
  if (path.endsWith('/api/posts')) return Response.json({boardId:'site:cgma:main',items:[]},{headers});
  return new Response('<!doctype html><title>게시판</title><h1>게시판</h1>',{status:200,headers:{'content-type':'text/html'}});
};

test('all four read-only independent CGMA probes pass and never mutate production', async () => {
  const calls=[];
  const probe=await checkCgmaBoard({fetchFn:async (url,opt)=>{calls.push({url,opt});return payloadFor(url);},sleep:async()=>{}});
  assert.equal(probe.ok,true);
  assert.equal(probe.results.length,4);
  assert.ok(calls.every(c=>c.opt.method==='GET' && new URL(c.url).origin==='https://ekodi.kr'));
  assert.ok(calls.every(c=>!c.opt.body && !c.opt.headers.authorization));
});

test('anonymous private membership endpoint must be denied and body never parsed', async () => {
  const target={path:'/cgma/board/api/memberships',kind:'private'};
  const exposed=await checkEndpoint(target,{fetchFn:async()=>({
    status:200,text:()=>{throw new Error('private data must not be accessed');}
  }),sleep:async()=>{}});
  assert.equal(exposed.ok,false);
  assert.equal(exposed.reason,'private_endpoint_exposed_or_unexpected_status');
  const denied=await checkEndpoint(target,{fetchFn:async()=>({status:401}),sleep:async()=>{}});
  assert.equal(denied.ok,true);
});

test('CGMA identity header is mandatory for health and posts', async () => {
  const health={path:'/cgma/board/api/health',kind:'health'};
  const wrong=await checkEndpoint(health,{fetchFn:async url=>Response.json({ok:true,boardId:'site:cgma:main',siteId:'cgma',independent:true}),sleep:async()=>{}});
  assert.equal(wrong.ok,false);
  assert.equal(wrong.reason,'board_identity_or_payload_invalid');
});

test('temporary 429 and 502 use bounded retries; exhausted status is failure', async () => {
  const target={path:'/cgma/board',kind:'html'};
  let count=0;
  const successful=await checkEndpoint(target,{fetchFn:async url=>++count<3?new Response('throttled',{status:429}):payloadFor(url),sleep:async()=>{}});
  assert.equal(successful.ok,true);
  assert.equal(count,3);
  count=0;
  const failed=await checkEndpoint(target,{fetchFn:async()=>{count++;return new Response('upstream',{status:502});},sleep:async()=>{}});
  assert.equal(failed.ok,false);
  assert.equal(failed.reason,'http_502');
  assert.equal(count,3);
});

test('invalid board page title must not count as healthy', async () => {
  const result=await checkEndpoint({path:'/cgma/board',kind:'html'},{
    fetchFn:async()=>new Response('<title>502 error</title><p>게시판</p>',{status:200}),
    sleep:async()=>{}
  });
  assert.equal(result.ok,false);
});
