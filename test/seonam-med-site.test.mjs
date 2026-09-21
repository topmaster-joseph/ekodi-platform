import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import spaceWorker from '../space-worker.js';

const spaceRoot=new URL('../space/',import.meta.url);
const contentType=path=>path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.js')?'application/javascript; charset=utf-8':path.endsWith('.json')?'application/json; charset=utf-8':'text/html; charset=utf-8';
const env={ASSETS:{fetch:async request=>{
  const pathname=new URL(request.url).pathname;
  try{const body=await readFile(new URL(`.${pathname}`,spaceRoot));return new Response(request.method==='HEAD'?null:body,{status:200,headers:{'content-type':contentType(pathname)}})}catch{return new Response('Not Found',{status:404})}
}}};

test('seonam medical civic channel is an indexable independent workspace site',async()=>{
  for(const path of ['/seonam-med','/seonam-med/history','/seonam-med/news','/seonam-med/voices','/seonam-med/finance','/seonam-med/network']){
    const response=await spaceWorker.fetch(new Request(`https://ekodi.kr${path}`),env);
    assert.equal(response.status,200,path);
    assert.equal(response.headers.get('x-ekodi-route'),'seonam-med-public',path);
    assert.equal(response.headers.get('x-ekodi-independent-site'),'true',path);
    assert.equal(response.headers.get('x-ekodi-site-class'),'civic-channel',path);
    assert.equal(response.headers.get('x-ekodi-workspace'),'seonam-med',path);
    assert.equal(response.headers.get('x-robots-tag'),'index, follow',path);
    const html=await response.text();
    assert.match(html,/서남권 국립의대 시민소통센터/,path);
    assert.match(html,/사실·주장 구분/,path);
    assert.match(html,/후원·회계 공개/,path);
  }
});

test('civic channel assets and source data are first party',async()=>{
  for(const path of ['/seonam-med/assets/site.css','/seonam-med/assets/site.js','/seonam-med/assets/data.json']){
    const response=await spaceWorker.fetch(new Request(`https://ekodi.kr${path}`),env);
    assert.equal(response.status,200,path);
    assert.equal(response.headers.get('x-ekodi-route'),'seonam-med-asset',path);
  }
  const data=JSON.parse(await readFile(new URL('../space/seonam-med-data.json',import.meta.url),'utf8'));
  assert.equal(data.lastChecked,'2026-09-21');
  assert.ok(data.timeline.some(item=>item.date==='1990'));
  assert.ok(data.timeline.some(item=>item.date==='2026.09.21'));
  assert.ok(data.news.every(item=>/^https:\/\//.test(item.url)));
  assert.equal(data.finance.income,0);
  assert.equal(data.finance.expense,0);
});

test('citizen voice API validates consent and writes through the scoped RPC',async()=>{
  const dataEnv={...env,DATA_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'publishable-test'};
  const originalFetch=globalThis.fetch;let payload=null;
  globalThis.fetch=async(input,init)=>{
    assert.equal(String(input),'https://example.supabase.co/rest/v1/rpc/seonam_med_submit_voice');
    payload=JSON.parse(init.body);
    return new Response(JSON.stringify({ok:true,submission_id:'00000000-0000-0000-0000-000000000001'}),{status:200,headers:{'content-type':'application/json'}});
  };
  try{
    const response=await spaceWorker.fetch(new Request('https://ekodi.kr/seonam-med/api/voices',{method:'POST',headers:{origin:'https://ekodi.kr','content-type':'application/json'},body:JSON.stringify({category:'proposal',name:'시민',contact:'',message:'의견입니다.',publicConsent:false,privacyConsent:true})}),dataEnv);
    assert.equal(response.status,200);assert.equal((await response.json()).ok,true);assert.equal(payload.p_category,'proposal');assert.equal(payload.p_message,'의견입니다.');
  }finally{globalThis.fetch=originalFetch}
  const denied=await spaceWorker.fetch(new Request('https://ekodi.kr/seonam-med/api/voices',{method:'POST',headers:{origin:'https://ekodi.kr','content-type':'application/json'},body:JSON.stringify({category:'question',message:'질문',privacyConsent:false})}),dataEnv);
  assert.equal(denied.status,400);
});

test('civic voice storage keeps browser roles away from raw submissions',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/20260921194000_seonam_med_civic_voice.sql',import.meta.url),'utf8');
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/revoke all on table public\.seonam_med_civic_voices from anon, authenticated/i);
  assert.match(sql,/security definer/i);
  assert.match(sql,/grant execute on function public\.seonam_med_submit_voice/i);
});

test('civic channel copy separates sources and viewpoints instead of making political recommendations',async()=>{
  const [page,data]=await Promise.all([
    readFile(new URL('../space/seonam-med.page',import.meta.url),'utf8'),
    readFile(new URL('../space/seonam-med-data.json',import.meta.url),'utf8')
  ]);
  assert.match(page,/특정 정치인·정당·기관에 대한 지지 또는 반대를 권고하지 않습니다/);
  assert.match(page,/공식 결정, 당사자 입장, 시민·단체 의견은 서로 다른 유형/);
  assert.match(data,/이는 목포대 측의 주장으로 기록합니다/);
});
