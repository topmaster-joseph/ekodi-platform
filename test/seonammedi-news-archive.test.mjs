import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleSeonamMediMonitorApi} from '../seonammedi-monitor.js';

const article=(id,day,overrides={})=>({
  id,title:'서남권 국립의대 신설 추진 '+id,
  summary_text:'전남 서남권 국립의대 신설 추진 관련 원문 보도.',
  url:'https://press.example.kr/'+id,
  resolved_url:'https://press.example.kr/'+id,
  publisher:'목포신문',published_at:day,first_seen_at:day,last_seen_at:day,
  source_type:'news',review_state:'source_only',source_verified:1,
  media_state:'none',...overrides
});

function mockDB(records){
  const sorted=records.slice().sort((a,b)=>String(b.published_at||b.first_seen_at).localeCompare(String(a.published_at||a.first_seen_at))||b.id-a.id);
  return{prepare(sql){
    if(sql==='SELECT source_verified FROM seonammedi_monitor_items LIMIT 0')return{all:async()=>({results:[]})};
    if(sql.includes('FROM seonammedi_monitor_runs'))return{first:async()=>({status:'ok',completed_at:'2026-10-13T01:00:00Z'})};
    if(sql.includes('FROM seonammedi_monitor_items'))return{
      all:async()=>({results:sorted.slice(0,160)}),
      bind(limit,offset){
        return{all:async()=>({results:sorted.filter(row=>!['rejected','archived'].includes(row.review_state)&&(row.review_state==='verified'||(row.source_verified===1&&row.source_type==='news'))).slice(offset,offset+limit)})};
      }
    };
    throw Error('unexpected statement: '+sql);
  }};
}

test('public auto-news pages include old verified records, in newest-first order, with no 7-day cutoff',async()=>{
  const rows=[
    article(1,'2026-10-12T00:00:00Z'),
    article(2,'2026-08-03T00:00:00Z'),
    article(3,'2024-05-01T00:00:00Z',{review_state:'verified',source_verified:0,source_type:'blog'}),
    article(4,'2026-10-13T00:00:00Z',{source_verified:0}),
    article(5,'2026-10-13T00:00:00Z',{review_state:'rejected'})
  ];
  const env={DB:mockDB(rows)};
  const url='https://ekodi.kr/api/seonammedi/monitor?limit=2';
  const first=await (await handleSeonamMediMonitorApi(new Request(url),env)).json();
  assert.equal(first.ok,true);
  assert.deepEqual(first.items.map(row=>row.id),[1,2]);
  assert.equal(first.sort,'publication_desc');
  assert.ok(first.nextCursor);
  const second=await (await handleSeonamMediMonitorApi(new Request(url+'&cursor='+first.nextCursor),env)).json();
  assert.deepEqual(second.items.map(row=>row.id),[3]);
  assert.equal(second.nextCursor,null);
  assert.ok(second.items.every(row=>['editor_verified','source_confirmed'].includes(row.content_match)));
});

test('unverified records cannot starve an old verified page or become auto-published',async()=>{
  const old=article(1,'2020-01-01T00:00:00Z');
  const junk=Array.from({length:180},(_,i)=>article(i+10,'2026-10-13T00:00:00Z',{title:'광주 스포츠 소식 '+i,summary_text:'의대와 무관한 스포츠 기사'}));
  const env={DB:mockDB([old,...junk])};
  const first=await (await handleSeonamMediMonitorApi(new Request('https://ekodi.kr/api/seonammedi/monitor?limit=10'),env)).json();
  assert.deepEqual(first.items.map(row=>row.id),[1]);
  assert.equal(first.nextCursor,null);
  const bad=await handleSeonamMediMonitorApi(new Request('https://ekodi.kr/api/seonammedi/monitor?cursor=invalid'),env);
  assert.equal(bad.status,400);
});

test('the public page retains publisher-based categories and automatic older-record loading',async()=>{
  const app=await readFile(new URL('../sites/seonammedi/public/app.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../sites/seonammedi/public/index.html',import.meta.url),'utf8');
  assert.match(app,/const monitorTimelineCategory=item=>/);
  assert.match(app,/relatedNewsCategory\(\{sourceType:item\.source_type,publisher:item\.publisher/);
  assert.match(app,/monitorNextCursor=data\.nextCursor\?\?null/);
  assert.match(app,/new IntersectionObserver/);
  assert.match(app,/sort\(timelineDescending\)/);
  assert.match(html,/id="timelineFeedStatus"/);
  assert.match(html,/id="timelineFeedMore"/);
  assert.match(html,/id="timelineLoadMore"/);
});

test('RSS input integrity and archive publication contract coexist after parallel merge',async()=>{
  const source=await readFile(new URL('../seonammedi-monitor.js',import.meta.url),'utf8');
  assert.match(source,/isValidSeonamMediRssDocument/);
  assert.match(source,/recentCandidateCount:recentCandidates\.length/);
  assert.match(source,/verifiedPublicCount:publicItems\.length/);
  assert.match(source,/nextCursor:exhausted\?null:String\(offset\)/);
});
