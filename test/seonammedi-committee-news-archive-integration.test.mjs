import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('verified-news archive and committee-specific feed share published automatic collection but not activity scope',async()=>{
  const [js,html,api,monitor]=await Promise.all([
    read('sites/seonammedi/public/app.js'),
    read('sites/seonammedi/public/index.html'),
    read('seonammedi-admin-control.js'),
    read('seonammedi-monitor.js')
  ]);
  for(const selector of ['committeeNewsList','committeeNewsForm','timelineFeedStatus','timelineFeedMore','timelineLoadMore'])
    assert.ok(html.includes('id="'+selector+'"'),'missing '+selector);
  for(const selector of ['renderCommitteeNews','bindCommitteeNewsAdmin','bindNewsAutoPaging','renderCommitteeActivity','applyMonitorTimelineUpdates'])
    assert.ok(js.includes('function '+selector+'('),'missing '+selector);
  assert.match(js,/monitorFeedEntries\.push\(item\)/);
  assert.match(js,/monitorNextCursor=data\.nextCursor\?\?null/);
  assert.match(js,/publicTimelineEntries\.filter\(isCommitteeRelatedNews\)\.slice\(\)\.sort\(timelineDescending\)/);
  assert.match(js,/if\(admin\.has\('timeline'\)\)bindCommitteeNewsAdmin\(\)/);
  assert.match(api,/committee_related INTEGER NOT NULL DEFAULT 0/);
  assert.match(monitor,/isValidSeonamMediRssDocument/);
  assert.match(monitor,/PUBLIC_NEWS_MAX_SCANS/);
  assert.match(monitor,/recentCandidateCount:recentCandidates\.length/);
  const match=js.match(/const isCommitteeRecord=item=>[^;]+;\nconst isCommitteeRelatedNews=item=>\{[\s\S]*?\n\};/);
  assert.ok(match);
  const classify=runInNewContext(match[0]+'\nisCommitteeRelatedNews');
  assert.equal(classify({recordScope:'committee',title:'서남권 국립의대 비대위 현장'}),false);
  assert.equal(classify({recordScope:'news',title:'서남권 국립의대 비대위 입장 기사'}),true);
  assert.equal(classify({recordScope:'news',committeeRelated:true,title:'위원회 자료'}),true);
  assert.equal(classify({recordScope:'news',title:'무관한 스포츠 방송'}),false);
});
