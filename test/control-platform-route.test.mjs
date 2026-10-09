import test from 'node:test';
import assert from 'node:assert/strict';
import router from '../platform-router-entry-worker.js';

const html='<!doctype html><html><body><h1>EKODI Control</h1><form id="commandForm"></form></body></html>';
const createEnv=()=>{
 const paths=[];
 const env={ASSETS:{async fetch(request){const path=new URL(request.url).pathname;paths.push(path);return new Response(path==='/control'?html:'asset',{status:200,headers:{'content-type':'text/html'}})}}};
 return {paths,env};
};

test('apex router opens Control at /admin/control instead of the generic admin shell',async()=>{
 const {env,paths}=createEnv();
 const r=await router.fetch(new Request('https://ekodi.kr/admin/control'),env,{waitUntil(){}});
 assert.equal(r.status,200);
 assert.equal(r.headers.get('x-ekodi-canonical-surface'),'control');
 assert.equal(r.headers.get('x-ekodi-route'),'control-surface');
 assert.match(await r.text(),/id="commandForm"/);
 assert.deepEqual(paths,['/control']);
});

test('apex router redirects /control preserving query string',async()=>{
 const {env,paths}=createEnv();
 const r=await router.fetch(new Request('https://ekodi.kr/control/?task=123'),env,{waitUntil(){}});
 assert.equal(r.status,308);
 assert.equal(r.headers.get('location'),'https://ekodi.kr/admin/control?task=123');
 assert.deepEqual(paths,[]);
});
