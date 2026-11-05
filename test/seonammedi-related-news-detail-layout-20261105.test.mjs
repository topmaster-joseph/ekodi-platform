import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../sites/seonammedi/public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../sites/seonammedi/public/app.css',import.meta.url),'utf8');

test('related news includes verified committee activities and their related press without duplicate row insertion',()=>{
  assert.match(app,/const relatedRows=publicTimelineEntries;/);
  assert.doesNotMatch(app,/const relatedRows=publicTimelineEntries\.filter\(item=>!isCommitteeRecord/);
  assert.match(app,/TIMELINE_FILTERS=\['전체','비대위 활동','신문'/);
  assert.match(app,/if\(isCommitteeRecord\(item\)\)return'비대위 활동'/);
  assert.match(app,/const rows=publicTimelineEntries\.filter\(item=>isCommitteeRecord\(item\)\|\|isCommitteeRelatedNews\(item\)\)/);
  assert.match(app,/if\(url&&rows\.some\(row=>isCommitteeRecord\(row\)&&row\.date===date/);
  assert.match(app,/function dropSupersededTimeline\(rows\)/);
});

test('expanded news text separates title from metadata, body and cited source, escaping unsafe content',()=>{
  const start=app.indexOf('function timelineTeaser(item){');
  const end=app.indexOf('const relatedNewsFilterMatches=',start);
  assert.ok(start>0&&end>start);
  const escapeHtml=v=>String(v??'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
  const make=new Function('escapeHtml','evidenceBlock','relatedNewsCategory','isCommitteeRecord',
    app.slice(start,end)+'return {timelineTeaser,timelineReadableSections,timelineExpandedDetails};');
  const helpers=make(escapeHtml,()=>'<a href="#">원문 보기</a>',()=> '신문',()=>false);
  const item={title:'의대 설립 논의',date:'2026.11.05.',summary:'제목: 의대 설립 논의 내용: 첫 문장입니다.\n두 번째 줄입니다.\n출처: 방송 기사 <script>alert(1)</script>'};
  const details=helpers.timelineExpandedDetails(item);
  assert.match(details,/<span>날짜: 2026\.11\.05\.<\/span>/);
  assert.match(details,/<span>분류: 신문<\/span>/);
  assert.match(details,/<h4>내용<\/h4>/);
  assert.match(details,/<h4>출처<\/h4>/);
  assert.match(details,/<h4>출처·근거자료<\/h4>/);
  assert.match(details,/첫 문장입니다/);
  assert.match(details,/두 번째 줄입니다/);
  assert.doesNotMatch(details,/<h4>제목<\/h4>/);
  assert.doesNotMatch(details,/<script>/);
  assert.match(details,/&lt;script&gt;/);
  assert.match(helpers.timelineTeaser(item),/첫 문장입니다/);
});

test('expanded article style has distinct sections and prevents summary duplication',()=>{
  assert.match(app,/timelineTeaser\(item\)/);
  assert.match(app,/timelineExpandedDetails\(item\)/);
  assert.match(css,/\.timeline-item:not\(\.is-collapsed\) \.timeline-summary\{display:none\}/);
  assert.match(css,/\.timeline-article-section h4\{/);
  assert.match(css,/\.timeline-item \.timeline-article-section p\{[^}]*white-space:pre-line/);
  assert.match(css,/@media\(max-width:760px\)/);
});
