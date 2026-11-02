import test from 'node:test';
import assert from 'node:assert/strict';
import {publicDevotionNarration} from '../bible-worker.js';
const date='2026-11-02';
const good={
 schema:'ekodi.devotion.narration.v1',date,status:'approved',language:'ko-KR',
 review:{rights:true,textIntegrity:true,voicePerformance:true,accessibility:true},
 tracks:{
  male:{file:'male.mp3',status:'approved',durationSec:30,sha256:'a'.repeat(64)},
  female:{file:'female.mp3',status:'approved',durationSec:32,sha256:'b'.repeat(64)}
 }
};
function env(manifest=good,files=true){
 const hits=[];
 return {hits,ASSETS:{fetch:async request=>{
   const path=new URL(request.url).pathname;
   hits.push(path);
   if(path.endsWith('/manifest.json'))return manifest?
       Response.json(manifest):new Response('not found',{status:404});
   if(path.endsWith('.mp3'))return files?
      new Response(request.method==='HEAD'?null:Uint8Array.from([0x49,0x44,0x33]),{status:200,headers:{'content-type':'audio/mpeg'}})
      :new Response('missing',{status:404});
   return new Response('not found',{status:404});
 }}};
}
const url=path=>'https://ekodi.kr/bible/narration/'+date+'/'+path;
test('Bible worker delivers only approved current/public male and female tracks',async()=>{
 const db=env();
 const manifest=await publicDevotionNarration(new Request(url('manifest.json')),db,'/narration/'+date+'/manifest.json');
 assert.equal(manifest.status,200);
 assert.deepEqual(Object.keys((await manifest.json()).tracks),['male','female']);
 for(const gender of ['male','female']){
   const response=await publicDevotionNarration(new Request(url(gender+'.mp3')),db,'/narration/'+date+'/'+gender+'.mp3');
   assert.equal(response.status,200);
   assert.equal(response.headers.get('content-type'),'audio/mpeg');
 }
});
test('public narration denies unapproved or absent tracks, future dates and traversal',async()=>{
 const pending=env({...good,status:'draft'});
 let r=await publicDevotionNarration(new Request(url('male.mp3')),pending,'/narration/'+date+'/male.mp3');
 assert.equal(r.status,404);
 assert.ok(pending.hits.every(s=>s.endsWith('manifest.json')),'unapproved audio bytes must not be fetched');
 const db=env();
 r=await publicDevotionNarration(new Request('https://ekodi.kr/bible/narration/2099-01-01/male.mp3'),db,'/narration/2099-01-01/male.mp3');
 assert.equal(r.status,404);assert.equal(db.hits.length,0);
 r=await publicDevotionNarration(new Request(url('secret.txt')),db,'/narration/'+date+'/secret.txt');
 assert.equal(r.status,404);
 const missing=env(good,false);
 r=await publicDevotionNarration(new Request(url('male.mp3')),missing,'/narration/'+date+'/male.mp3');
 assert.equal(r.status,404);
 r=await publicDevotionNarration(new Request(url('female.mp3'),{method:'POST'}),db,'/narration/'+date+'/female.mp3');
 assert.equal(r.status,405);
});
