import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import service from '../cgma-board-service-worker.js';

const config=await readFile(new URL('../wrangler.cgma-board-internal.toml',import.meta.url),'utf8');
const source=await readFile(new URL('../cgma-board-service-worker.js',import.meta.url),'utf8');
test('CGMA board service has no publicly reachable Worker routes or static assets',()=>{
 assert.match(config,/name = "ekodi-cgma-board-internal"/);
 assert.match(config,/main = "cgma-board-service-worker.js"/);
 assert.match(config,/workers_dev = false/);
 assert.match(config,/preview_urls = false/);
 assert.doesNotMatch(config,/\[\[routes\]\]|\[assets\]/);
 assert.match(config,/binding = "DB"[\s\S]*database_name = "ekodi-auth"/);
 assert.match(config,/binding = "CONTROL_API"[\s\S]*service = "ekodi-auth-api"/);
});
test('CGMA board ingress rejects unrelated hosts, sites and public paths',async()=>{
 for(const url of ['https://ekodi.kr/cgma/board','https://board.internal.ekodi/cheonggye/board','https://board.internal.ekodi/','https://board.internal.ekodi/cgma/admin']){
   const r=await service.fetch(new Request(url),{});
   assert.equal(r.status,404,url);
   assert.equal(r.headers.get('cache-control'),'no-store');
 }
});
test('authorized service binding does not return static HTML for CGMA board health',async()=>{
 const instance={board_id:'site:cgma:main',site_id:'cgma',tenant_slug:'cheonggye',status:'active'};
 const calls=[];
 const env={DB:{batch:async()=>[],prepare:(sql)=>{calls.push(sql);return{
   bind(){return this},
   async run(){return {success:true}},
   async first(){return instance},
   async all(){return {results:[]}},
 };}}};
 const r=await service.fetch(new Request('https://board.internal.ekodi/cgma/board/api/health'),env);
 assert.equal(r.status,200);
 assert.equal(r.headers.get('x-ekodi-board-independent'),'true');
 assert.equal(r.headers.get('x-ekodi-board-id'),'site:cgma:main');
 assert.equal(r.headers.get('content-type')?.startsWith('application/json'),true);
 const data=await r.json();
 assert.equal(data.siteId,'cgma');
 assert.equal(data.independent,true);
 assert.ok(calls.some(sql=>sql.includes('ekodi_board_instances')));
});
test('the internal service uses the existing board authorization, never synthetic ownership',()=>{
 assert.match(source,/handleSiteBoardRequest\(request,env\)/);
 assert.doesNotMatch(source,/new Response\('CGMA board',\{status:200/);
});
