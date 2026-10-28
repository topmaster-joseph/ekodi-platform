import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../search-visibility-control.js',import.meta.url),'utf8');

test('SeonamMedi standalone English canonical and Korean promotional IDN are separate properties',()=>{
  assert.match(source,/DOMAIN_CANONICAL_FOR_PATH=Object\.freeze\(\{'\/seonammedi':'https:\/\/seonammedi\.kr\/'\}\)/);
  assert.match(source,/'\/seonammedi':\['seonammedi\.kr','서남권국립의대\.kr'\]/);
  assert.match(source,/propertyType:'independent-domain',canonicalUrl:DOMAIN_CANONICAL_FOR_PATH\[key\]\|\|site\.url/);
  assert.match(source,/if\(!unique\.has\(url\)\)unique\.set\(url/);
  assert.match(source,/SITE_NOT_PUBLIC/);
});

test('Host normalization accepts canonical ASCII and Unicode IDN only, rejecting credentials and ports',()=>{
  const declaration=source.match(/const safeHost=value=>\{[\s\S]*?\n\};/)?.[0];
  assert.ok(declaration,'safeHost must remain an isolated strict normalizer');
  const normalize=vm.runInNewContext(
    '(value)=>{const safe=(v,n=320)=>String(v??"").trim().slice(0,n);'+declaration+'return safeHost(value);}',
    {URL},
  );
  assert.equal(normalize('seonammedi.kr'),'seonammedi.kr');
  assert.equal(normalize('서남권국립의대.kr'),new URL('https://서남권국립의대.kr/').hostname);
  assert.match(normalize('서남권국립의대.kr'),/^xn--/);
  for(const bad of ['ekodi.kr','www.seonammedi.kr','localhost','bad.com:443','abc.kr@evil.kr','abc.kr?key=x','abc.kr#top','not a host']){
    assert.equal(normalize(bad),'','must reject '+bad);
  }
});

test('Canonical Search Visibility UI has six ordered stages without inventing external success',()=>{
  const ui=readFileSync(new URL('../search-visibility-admin.js',import.meta.url),'utf8');
  const stages=['1. 대상과 대표 주소','2. 검색 수집 기술 점검',
    '3. 검색엔진 소유권 확인','4. 사이트맵 제출 및 수집 알림',
    '5. 색인·발견 확인','6. 노출·클릭 등 실측 성과'];
  let previous=-1;
  for(const stage of stages){
    const index=ui.indexOf(stage);
    assert.ok(index>previous,'stage missing or out of order: '+stage);
    previous=index;
  }
  assert.match(ui,/data-sv-sequence/);
  assert.match(ui,/renderExecutionSteps\(\)/);
  assert.match(ui,/row\.site_url===site\.url&&primary\.has\(row\.provider_id\)/);
  assert.match(ui,/수동 근거 기록 · 자동 검증 아님/);
  assert.match(ui,/공식 공급자 성과 API 미연동 · 수치 미확인/);
  assert.match(ui,/separate\?'별도 도메인 점검 필요/);
  assert.doesNotMatch(ui,/localStorage\.setItem\(/);
});
