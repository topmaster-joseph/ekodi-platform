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

test('gnuboard/MBC containers and a paragraph fallback are read',()=>{
  assert.match(extractArticleBodies('<div id="bo_v_con"><p>갈등으로 번진 전남 국립의대 목포 재심사</p></div>')[0],/전남 국립의대/);
  assert.match(extractArticleBodies('<div class="news_txt">2030년 개교 국립의대 발표 지연 서남권</div>')[0],/국립의대 발표/);
  const page='<nav><p>서남권 국립의대 메뉴 링크 텍스트 스무 글자 이상</p></nav><p>전남 국립의대 후보 발표가 당초 예정보다 늦어지면서 서남권 지역의 반발과 우려가 계속 이어지고 있다고 지역 언론은 전했다.</p><p>교육부는 이달 안에 심사 일정을 정하겠다고 밝혔으며 지역에서는 공정성과 절차에 대한 우려가 여전히 크다는 목소리가 나온다.</p><p>목포대와 서남권 시군은 공정한 심사를 다시 요구하며 공동 대응에 나섰다.</p><p>ⓒ 무단전재 금지 저작권 표기 문장입니다 테스트</p>';
  const bodies=extractArticleBodies(page);
  assert.equal(bodies.length,1);
  assert.doesNotMatch(bodies[0],/메뉴|무단전재/);
  assert.equal(extractArticleBodies('<p>짧은 문장 하나뿐입니다 스무 글자 이상 문장</p>').length,0,'a lone paragraph is not a body');
});
