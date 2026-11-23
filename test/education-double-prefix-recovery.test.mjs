import test from 'node:test';
import assert from 'node:assert/strict';
import {routeCanonicalSurface} from '../canonical-surface-router.js';

const root='https://ekodi.kr';
const invalidPaths=[
 '/edu/edu/study/',
 '/edu/edu/study/live/',
 '/edu/edu/courses/',
 '/edu/edu/learn/foreign-worker-cold-safety-2026/',
 '/edu/edu/edu/study/',
 '/edu/edu',
];

test('repeated /edu paths are rejected at source, not redirected to a different address',async()=>{
 for(const source of invalidPaths){
  for(const method of ['GET','HEAD','POST']){
   const response=await routeCanonicalSurface(new Request(root+source+'?course=2026',{method}),{});
   assert.equal(response.status,404,source+' '+method);
   assert.equal(response.headers.get('location'),null,source+' '+method);
   assert.equal(response.headers.get('x-ekodi-route'),'edu-repeated-prefix-rejected',source+' '+method);
   assert.equal(response.headers.get('cache-control'),'no-store');
   assert.match(response.headers.get('x-robots-tag'),/noindex/);
   assert.equal([301,302,303,307,308].includes(response.status),false);
  }
 }
});

test('Education catalog JSON remains service relative and is never mutated by the shared proxy',async()=>{
 const canonicalPayload={
  schemaVersion:2,
  courses:[
   {id:'mnu-factchat-2026',studyUrl:'/study/live/?c=mnu-factchat-2026',teacherTool:'/study/live/?c=mnu-factchat-2026',learnerTool:'/study/live/lab/?c=mnu-factchat-2026'},
   {id:'pizza-experience-2026',studyUrl:'/pizza-experience/'}
  ],
  fields:[],audiences:[]
 };
 const upstream=[];
 const env={EDUCATION:{fetch:async req=>{
  upstream.push(new URL(req.url).pathname);
  return new Response(JSON.stringify(canonicalPayload),{status:200,headers:{'content-type':'application/json; charset=utf-8'}});
 }}};
 const result=await routeCanonicalSurface(new Request(root+'/edu/courses/catalog.json'),env);
 assert.equal(result.status,200);
 assert.equal(result.headers.get('location'),null);
 assert.deepEqual(upstream,['/courses/catalog.json']);
 assert.deepEqual(await result.json(),canonicalPayload);
 assert.equal(result.headers.get('x-ekodi-canonical-path'),'/edu');
});

test('existing /edu pages are passed to Education exactly once without redirect',async()=>{
 const received=[];
 const env={EDUCATION:{fetch:async req=>{
  received.push(new URL(req.url).pathname);
  return new Response('<html>Education</html>',{status:200,headers:{'content-type':'text/html'}});
 }}};
 for(const path of ['/edu/study/','/edu/teach/','/edu/learn/','/edu/courses/']){
  const response=await routeCanonicalSurface(new Request(root+path),env);
  assert.equal(response.status,200,path);
  assert.equal(response.headers.get('location'),null,path);
 }
 assert.deepEqual(received,['/study/','/teach/','/learn/','/courses/']);
});

test('partial path prefixes and unrelated hosts never enter the repeated-prefix rejection',async()=>{
 for(const target of ['/edu/educator/study/','/edu/edu-other/study/','/eduedu/study/','/edu/study/']){
  const result=await routeCanonicalSurface(new Request(root+target),{});
  assert.notEqual(result?.headers?.get('x-ekodi-route'),'edu-repeated-prefix-rejected',target);
 }
 assert.equal(await routeCanonicalSurface(new Request('https://other.example/edu/edu/study/'),{}),null);
});
