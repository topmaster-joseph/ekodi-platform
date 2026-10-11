import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePublicChurchWorship} from '../church-public-worship-control.js';
const URL='https://ekodi.kr/api/public/church/worship';
test('same-origin published worship endpoint uses anon key and date-filtered RLS',async()=>{
  let upstream;const res=await handlePublicChurchWorship(new Request(URL+'?from=2026-10-11'),{}, {fetch:async(url,options)=>{upstream={url,options};return new Response(JSON.stringify([{service_type:'sunday',service_date:'2026-10-11',title:'모두가 듣도록, 다음 세대까지',scripture:'신명기 31:9-18',service_time:'11:00'}]),{status:200})}});
  assert.equal(res.status,200);assert.equal((await res.json()).items[0].title,'모두가 듣도록, 다음 세대까지');
  assert.match(upstream.url,/is_published=eq.true/);assert.match(upstream.url,/service_date=gte.2026-10-11/);assert.ok(upstream.options.headers.apikey);assert.equal(upstream.options.headers.authorization,undefined);
});
test('cannot call unrelated API or modify worship data, and never exposes unlisted fields',async()=>{
  assert.equal(await handlePublicChurchWorship(new Request('https://ekodi.kr/api/public/other')),null);
  assert.equal((await handlePublicChurchWorship(new Request(URL,{method:'POST'}))).status,405);
  assert.equal((await handlePublicChurchWorship(new Request(URL+'?from=bad'))).status,400);
  const r=await handlePublicChurchWorship(new Request(URL+'?from=2026-10-11'),{}, {fetch:async()=>new Response(JSON.stringify([{service_type:'sunday',service_date:'2026-10-11',title:'공개',private_notes:'secret'}]))});
  assert.equal((await r.json()).items[0].private_notes,undefined);
});
