import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canonicalArticleUrl,newsTitleKey,dedupeSeonamMediNews} from '../seonammedi-monitor.js';

// Production (2026-10-19): the first 15 verified items contained the same
// article twice via AMP/alternate URLs and identical " - 매체명" titles.

test('AMP, mobile and tracking variants share one canonical URL',()=>{
  assert.equal(canonicalArticleUrl('https://www.newsfreezone.co.kr/news/articleViewAmp.html?idxno=7'),canonicalArticleUrl('https://newsfreezone.co.kr/news/articleView.html?idxno=7'));
  assert.equal(canonicalArticleUrl('https://m.news.example.kr/amp/a/1?utm_source=x'),canonicalArticleUrl('https://news.example.kr/a/1'));
  assert.notEqual(canonicalArticleUrl('https://a.kr/news?idxno=1'),canonicalArticleUrl('https://a.kr/news?idxno=2'));
  assert.equal(canonicalArticleUrl('not a url'),'');
});

test('title key ignores the publisher suffix, quotes and spacing',()=>{
  assert.equal(newsTitleKey('목포대 "교육부, 목포대 포함해 국립의대 후보 심사해야" - KBC광주방송','KBC광주방송'),newsTitleKey('목포대 “교육부 목포대 포함해 국립의대 후보 심사해야”'));
});

test('public feed shows each article once but keeps separate outlets',()=>{
  const rows=[
    {id:1,title:'목포대 "교육부, 목포대 포함해 국립의대 후보 심사해야" - KBC광주방송',publisher:'KBC광주방송',resolved_url:'https://news.ikbc.co.kr/news/article/view/kbc202610150088'},
    {id:2,title:'목포대 "교육부, 목포대 포함해 국립의대 후보 심사해야" - KBC광주방송',publisher:'KBC광주방송',resolved_url:'https://news.ikbc.co.kr/article/view/kbc202610150088'},
    {id:3,title:'서남권의대비상대책위원회, 불공정 의대 추천 민형배 시장 사퇴 촉구 - 뉴스프리존',publisher:'뉴스프리존',resolved_url:'https://www.newsfreezone.co.kr/news/articleViewAmp.html?idxno=7'},
    {id:4,title:'서남권의대비상대책위원회, 불공정 의대 추천 민형배 시장 사퇴 촉구 - 뉴스프리존',publisher:'뉴스프리존',resolved_url:'https://www.newsfreezone.co.kr/news/articleView.html?idxno=7'},
    {id:5,title:'"의대 추천 불공정 책임져라"… 서남권 비대위, 민형배 시장 사퇴 촉구 - 데일리저널',publisher:'데일리저널',resolved_url:'https://www.dailyjn.com/news/articleView.html?idxno=104676'}
  ];
  assert.deepEqual(dedupeSeonamMediNews(rows).map(x=>x.id),[1,3,5]);
});

test('public API applies dedupe and the runner passes optional Naver credentials',async()=>{
  const [monitor,workflow,runner]=await Promise.all([
    readFile(new URL('../seonammedi-monitor.js',import.meta.url),'utf8'),
    readFile(new URL('../.github/workflows/seonammedi-news-monitor-runner.yml',import.meta.url),'utf8'),
    readFile(new URL('../scripts/seonammedi-monitor-runner.mjs',import.meta.url),'utf8')
  ]);
  assert.match(monitor,/const publicItems=dedupeSeonamMediNews\(collected\)/);
  assert.match(workflow,/NAVER_CLIENT_ID: \$\{\{ secrets\.NAVER_CLIENT_ID \}\}/);
  assert.match(workflow,/NAVER_CLIENT_SECRET: \$\{\{ secrets\.NAVER_CLIENT_SECRET \}\}/);
  assert.match(runner,/process\.env\.NAVER_CLIENT_ID&&process\.env\.NAVER_CLIENT_SECRET/);
});
