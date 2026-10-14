import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {hasRegionalMedicalContext,isPublicSeonamMediSource} from '../seonammedi-relevance.js';

const related={
  title:'전남광주시 첫 시정질문, 국립의대 등 다뤄질 듯',
  summary_text:'전남광주시의회가 국립의대 신설 추진과 조직 인사를 논의한다.',
  resolved_url:'https://news.example.kr/article/22',
  source_type:'news',
  review_state:'source_only',
  source_verified:1
};

test('regional headline and independently retrieved article content must both match',()=>{
  assert.equal(hasRegionalMedicalContext(related.title),true);
  assert.equal(isPublicSeonamMediSource(related),true);
  assert.equal(isPublicSeonamMediSource({...related,source_verified:0}),false);
  assert.equal(isPublicSeonamMediSource({...related,source_verified:undefined}),false);
  assert.equal(isPublicSeonamMediSource({...related,source_verified:0,query_label:'서남권 국립의대',publisher:'서남권 국립의대'}),false);
  assert.equal(isPublicSeonamMediSource({...related,source_verified:0,review_state:'verified'}),true);
  assert.equal(isPublicSeonamMediSource({...related,summary_text:''}),false);
  assert.equal(isPublicSeonamMediSource({...related,summary_text:'이번 경기는 승부차기에서 결정됐다.'}),false);
  assert.equal(isPublicSeonamMediSource({...related,resolved_url:'https://news.google.com/rss/articles/abc'}),false);
});

test('Calgary Roughnecks false hit is not rescued by a misleading search label',()=>{
  const falseHit={...related,title:'새로 접한 게임을 이해하는 출발점, 다북다재 슬롯 - Calgary Roughnecks',query_label:'목포대 국립의대',publisher:'목포대 국립의대'};
  assert.equal(isPublicSeonamMediSource(falseHit),false);
  assert.equal(hasRegionalMedicalContext('광주 의대생 체육대회'),false);
  assert.equal(isPublicSeonamMediSource({...related,title:'광주 의대생 체육대회'}),false);
});

test('blogs require editorial approval; rejected records never appear',()=>{
  assert.equal(isPublicSeonamMediSource({...related,source_type:'blog'}),false);
  assert.equal(isPublicSeonamMediSource({...related,source_type:'blog',review_state:'verified'}),true);
  assert.equal(isPublicSeonamMediSource({...related,review_state:'rejected'}),false);
  assert.equal(isPublicSeonamMediSource({...related,review_state:'archived'}),false);
});

test('public API, timeline and media require the content matching contract',async()=>{
  const [server,client]=await Promise.all([
    readFile(new URL('../seonammedi-monitor.js',import.meta.url),'utf8'),
    readFile(new URL('../sites/seonammedi/public/app.js',import.meta.url),'utf8')
  ]);
  assert.match(server,/isPublicSeonamMediSource/);
  assert.match(server,/originalTitle/);
  assert.match(server,/articleEvidence/);
  assert.match(server,/ensureSourceVerificationColumn/);
  assert.match(server,/source_verified=CASE WHEN \?=1 THEN 1 ELSE source_verified END/);
  assert.match(server,/source_type,summary_text,source_verified FROM seonammedi_monitor_items/);
  assert.match(server,/sourceVerified:Boolean\(verifiedSummary\)/);
  assert.match(server,/publicItems=.*filter\(isPublicSeonamMediSource\)/);
  assert.match(server,/content_match:item\.review_state/);
  assert.match(client,/monitorPubliclyVisible/);
  assert.match(client,/filter\(monitorPubliclyVisible\)/);
  assert.doesNotMatch(client,/String\(item\.query_label\|\|''\)\+' '\+String\(item\.publisher\|\|''\)/);
});
