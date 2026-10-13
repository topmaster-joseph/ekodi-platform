import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {planSeonamMediEvidenceBudget} from '../seonammedi-monitor.js';
import {isPublicSeonamMediSource} from '../seonammedi-relevance.js';

const items=(key,count)=>Array.from({length:count},(_,i)=>({
  title:'서남권 국립의대 신설 추진 관련 기사 '+key+i,
  url:'https://publisher.example/'+key+'/'+i,
  publishedAt:new Date(Date.UTC(2026,9,13-i)).toISOString()
}));

test('four active queries each get two publisher evidence attempts within the eight-attempt cap',()=>{
  const plan=planSeonamMediEvidenceBudget([items('a',5),items('b',5),items('c',5),items('committee',5)]);
  assert.equal(plan.length,8);
  assert.deepEqual(plan.map(row=>row.queryIndex),[0,1,2,3,0,1,2,3]);
  assert.deepEqual(plan.filter(row=>row.queryIndex===3).map(row=>row.itemIndex),[0,1]);
});

test('unused quotas rotate into other topics; no request burst exceeds eight',()=>{
  const plan=planSeonamMediEvidenceBudget([items('a',4),[],items('c',6),[]]);
  assert.deepEqual(plan.map(row=>row.queryIndex),[0,2,0,2,0,2,0,2]);
  assert.equal(planSeonamMediEvidenceBudget([items('a',15)],100).length,8);
  assert.equal(planSeonamMediEvidenceBudget([items('a',15)],0).length,0);
  assert.deepEqual(planSeonamMediEvidenceBudget([[],[],[],[]]),[]);
});

test('duplicate URLs and unrelated headlines do not exhaust the publisher evidence budget',()=>{
  const duplicate=items('duplicate',1)[0];
  const plan=planSeonamMediEvidenceBudget([
    [duplicate],
    [duplicate,{title:'일반 주식시장 변동',url:'https://publisher.example/unrelated'},...items('news',2)],
    [],
    []
  ]);
  assert.equal(plan.length,3);
  assert.deepEqual(plan.map(row=>row.queryIndex),[0,1,1]);
});

test('publisher verification remains fail-closed and home shows collection status instead of hiding',async()=>{
  const candidate={title:'서남권 국립의대 신설 추진',summary_text:'서남권 국립의대 신설 관련 추진 내용',source_type:'news',resolved_url:'https://publisher.example/story',source_verified:0};
  assert.equal(isPublicSeonamMediSource(candidate),false);
  assert.equal(isPublicSeonamMediSource({...candidate,source_verified:1}),true);
  assert.equal(isPublicSeonamMediSource({...candidate,source_verified:1,resolved_url:'https://news.google.com/rss/articles/example'}),false);
  const app=await readFile(new URL('../sites/seonammedi/public/app.js',import.meta.url),'utf8');
  assert.match(app,/section\.hidden=false/);
  assert.match(app,/공개 검증 기사/);
  assert.match(app,/자동수집 상태를 현재 확인할 수 없습니다/);
});
