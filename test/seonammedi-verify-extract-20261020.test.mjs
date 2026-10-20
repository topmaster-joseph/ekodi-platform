import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extractArticleBodies} from '../seonammedi-monitor.js';
import {isRelevantHeadline,isPublicSeonamMediSource} from '../seonammedi-relevance.js';

// Production (2026-10-20): no item published after 10-16 passed verification;
// relevant articles failed because Korean CMSs keep the body outside <article>
// and some headlines name 국립의대 without a place.

test('body is read from ndsoft containers without side columns',()=>{
  const html='<div class="wrap"><div id="article-view-content-div"><div><p>전남광주통합특별시가 국립의대 추천 논란 속에 첫 국정감사를 받는다.</p></div><p>서남권 시민단체 촉구.</p></div><div class="side">다른 기사 서남권 국립의대</div></div>';
  assert.deepEqual(extractArticleBodies(html),['전남광주통합특별시가 국립의대 추천 논란 속에 첫 국정감사를 받는다. 서남권 시민단체 촉구.']);
});

test('JSON-LD articleBody and itemprop containers are recognised',()=>{
  assert.deepEqual(extractArticleBodies('<script type="application/ld+json">{"articleBody":"서남권 국립의대 설립 \\"지연\\""}</script>'),['서남권 국립의대 설립 "지연"']);
  assert.match(extractArticleBodies('<section itemprop="articleBody"><p>목포 국립의대 유치</p></section>')[0],/목포 국립의대 유치/);
  assert.deepEqual(extractArticleBodies('<div class="menu">국립의대</div>'),[]);
});

test('a headline naming the project is enough when the verified body is regional',()=>{
  assert.equal(isRelevantHeadline('2030년 개교라면서…늦어지는 국립의대 발표 왜?'),true);
  assert.equal(isRelevantHeadline('군공항 속도전…주민투표 먹구름'),false);
  const base={review_state:'source_only',source_verified:1,source_type:'news',resolved_url:'https://ysmbc.co.kr/NewsArticle/1541672'};
  assert.equal(isPublicSeonamMediSource({...base,title:'2030년 개교라면서…늦어지는 국립의대 발표 왜?',summary_text:'전남 국립의대 후보 발표가 늦어지면서 서남권 반발이 커지고 있다.'}),true);
  assert.equal(isPublicSeonamMediSource({...base,title:'2030년 개교라면서…늦어지는 국립의대 발표 왜?',summary_text:'의대 정원 발표가 늦어지고 있다.'}),false,'body must carry the regional context');
});

test('runner job has room for the larger verification batch',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/seonammedi-news-monitor-runner.yml',import.meta.url),'utf8');
  assert.match(workflow,/timeout-minutes: 30/);
});
