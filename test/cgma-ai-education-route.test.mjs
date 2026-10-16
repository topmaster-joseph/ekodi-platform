import test from 'node:test';
import assert from 'node:assert/strict';
import {isCgmaAiEducationPath,routeCgmaAiEducation} from '../cgma-ai-education-route.js';

const base='https://ekodi.kr/cgma/ai-education';
const req=(suffix='/',method='GET')=>new Request(base+suffix,{method});
const env={ASSETS:{async fetch(request){
  const path=new URL(request.url).pathname;
  if(path=== '/cgma/ai-education/'){
    return new Response('<!doctype html><html lang="ko"><title>설문</title></html>',{headers:{'content-type':'text/html; charset=utf-8'}});
  }
  if(path=== '/cgma/ai-education/app.js'){
    return new Response('console.log("survey")',{headers:{'content-type':'text/javascript'}});
  }
  return new Response('Not Found',{status:404});
}}};

test('canonical CGMA path matches only survey subtree',()=>{
  assert.equal(isCgmaAiEducationPath('/cgma/ai-education'),true);
  assert.equal(isCgmaAiEducationPath('/cgma/ai-education/'),true);
  assert.equal(isCgmaAiEducationPath('/cgma/ai-education-other'),false);
  assert.equal(isCgmaAiEducationPath('/cheonggye/ai-education/'),false);
});
test('slash canonical redirect preserves query on same trusted origin',async()=>{
  const result=await routeCgmaAiEducation(new Request(base+'?source=cgma'),env);
  assert.equal(result.status,308);
  assert.equal(result.headers.get('location'),base+'/?source=cgma');
});
test('anonymous survey response has strict CSP, no store and tenant route identity',async()=>{
  const result=await routeCgmaAiEducation(req(),env);
  assert.equal(result.status,200);
  assert.match(result.headers.get('content-type'),/text\/html/);
  assert.equal(result.headers.get('cache-control'),'no-store');
  assert.equal(result.headers.get('x-ekodi-route'),'cgma-ai-education-survey');
  assert.equal(result.headers.get('x-ekodi-workspace'),'cgma');
  assert.match(result.headers.get('content-security-policy'),/script-src 'self'/);
  assert.doesNotMatch(result.headers.get('content-security-policy'),/script-src[^;]*unsafe-inline/);
});
test('same-origin survey app script is delivered with correct MIME',async()=>{
  const result=await routeCgmaAiEducation(req('/app.js'),env);
  assert.equal(result.status,200);
  assert.match(result.headers.get('content-type'),/javascript/);
  assert.equal(result.headers.get('x-ekodi-route'),'cgma-ai-education-survey');
});
test('writes, unknown routes and missing asset binding fail closed',async()=>{
  const write=await routeCgmaAiEducation(req('/','POST'),env);
  assert.equal(write.status,405);
  assert.equal(write.headers.get('allow'),'GET, HEAD');
  assert.equal((await routeCgmaAiEducation(req('/admin'),env)).status,404);
  assert.equal((await routeCgmaAiEducation(req(),{})).status,503);
  assert.equal(await routeCgmaAiEducation(new Request('https://ekodi.kr/cgma/board'),env),null);
});
test('asset type mismatch is not accepted as working survey',async()=>{
  const bad={ASSETS:{fetch:async()=>new Response('{}',{headers:{'content-type':'application/json'}})}};
  assert.equal((await routeCgmaAiEducation(req(),bad)).status,503);
});
