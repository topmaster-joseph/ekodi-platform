import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isValidSeonamMediRssDocument} from '../seonammedi-monitor.js';
import {isPublicSeonamMediSource} from '../seonammedi-relevance.js';

test('an HTTP 200 page requires RSS root and channel to count as a valid source',()=>{
  const valid='<?xml version="1.0"?><rss version="2.0"><channel><title>서남권 의대</title></channel></rss>';
  assert.equal(isValidSeonamMediRssDocument(valid),true);
  assert.equal(isValidSeonamMediRssDocument('<rss><channel></channel></rss>'),true);
  assert.equal(isValidSeonamMediRssDocument('<html><title>Service temporarily unavailable</title></html>'),false);
  assert.equal(isValidSeonamMediRssDocument('<rss/>'),false);
  assert.equal(isValidSeonamMediRssDocument('<rss><channel>incomplete'),false);
  assert.equal(isValidSeonamMediRssDocument(''),false);
});

test('RSS validation failure is recorded before counting a source as checked',async()=>{
  const source=await readFile(new URL('../seonammedi-monitor.js',import.meta.url),'utf8');
  assert.match(source,/if\(!isValidSeonamMediRssDocument\(xml\)\)throw new Error\('invalid_rss_document'\)/);
  assert.match(source,/const items=parseRss\(await fetchSeonamMediNewsRss\(query\.q\)/);
  assert.match(source,/parseRss\([^;]+;checked\+=1;seen\+=items\.length/);
});

test('the public API distinguishes candidate records from publishable news',async()=>{
  const source=await readFile(new URL('../seonammedi-monitor.js',import.meta.url),'utf8');
  assert.match(source,/recentCandidateCount:recentCandidates\.length/);
  assert.match(source,/verifiedPublicCount:publicItems\.length/);
  const unverified={
    title:'서남권 국립의대 신설 관련 뉴스',
    summary_text:'서남권 지역 국립의대 신설 계획이 논의됐다.',
    source_type:'news',
    resolved_url:'https://publisher.example.org/article',
    review_state:'source_only',
    source_verified:0
  };
  assert.equal(isPublicSeonamMediSource(unverified),false);
  assert.equal(isPublicSeonamMediSource({...unverified,source_verified:1}),true);
});

test('the public homepage never silently hides empty or degraded verified news',async()=>{
  const app=await readFile(new URL('../sites/seonammedi/public/app.js',import.meta.url),'utf8');
  assert.match(app,/section\.hidden=false/);
  assert.match(app,/state==='partial'\?'일부 뉴스 검색원에서 오류가 발생했습니다/);
  assert.match(app,/state==='failed'\?'일부 외부 뉴스 검색 서비스에 장애가 있습니다/);
  assert.match(app,/검증되지 않은 검색 결과는 자동으로 공개하지 않습니다/);
  assert.match(app,/<a href="#timeline">관련소식<\/a>/);
  assert.match(app,/function monitorHomeRows/);
  assert.match(app,/sort\(\(a,b\)=>String\(b\.published_at/);
});
