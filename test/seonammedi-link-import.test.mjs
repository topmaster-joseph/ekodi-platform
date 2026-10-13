import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {safeImportUrl,extractSeonamMediArticle,fetchSeonamMediLinkPreview} from '../seonammedi-link-import.js';

const goodArticle=[
'<!doctype html><html><head>',
'<meta property="og:title" content="전남 국립의대 신설, 목포대·순천대 논의">',
'<meta name="og:description" content="전라남도가 목포대와 순천대의 국립의과대학 설립에 관한 협의를 진행하고 있다.">',
'<meta property="article:published_time" content="2026-10-09T07:00:00+09:00">',
'<meta property="og:site_name" content="지역보도">',
'</head><body><article><p>전남 국립의대 신설 관련 대학통합 협의는 목포대와 순천대를 중심으로 진행 중이다.</p></article></body></html>'
].join('');

test('link-only import extracts verified headline body date source without manual entry',()=>{
  const result=extractSeonamMediArticle(goodArticle,'https://news.example.kr/health/1');
  assert.equal(result.title,'전남 국립의대 신설, 목포대·순천대 논의');
  assert.equal(result.date,'2026.10.09');
  assert.equal(result.publisher,'지역보도');
  assert.equal(result.relevant,true);assert.equal(result.ready,true);
  assert.match(result.summary,/국립의대 신설/);
});

test('misleading search hit, missing article date, and unrelated article body must fail closed',()=>{
  const bogus=goodArticle.replace('전남 국립의대 신설, 목포대·순천대 논의','Calgary Roughnecks 슬롯 게임 추천');
  assert.equal(extractSeonamMediArticle(bogus,'https://news.example.kr/1').ready,false);
  const noDate=goodArticle.replace(/<meta property="article:published_time"[^>]+>/,'');
  assert.equal(extractSeonamMediArticle(noDate,'https://news.example.kr/1').ready,false);
  const bodyWrong=goodArticle.replace('전라남도가 목포대와 순천대의 국립의과대학 설립에 관한 협의를 진행하고 있다.','캐나다 스포츠 경기 분석 자료다.')
    .replace('전남 국립의대 신설 관련 대학통합 협의는 목포대와 순천대를 중심으로 진행 중이다.','새로운 아이스하키 시즌 분석이다.');
  assert.equal(extractSeonamMediArticle(bodyWrong,'https://news.example.kr/1').ready,false);
  const seoOnly=goodArticle.replace(
    '전남 국립의대 신설 관련 대학통합 협의는 목포대와 순천대를 중심으로 진행 중이다.',
    '캐나다 프로 스포츠 리그 선수 등록과 경기 운영 일정이 변경되어 구단들이 시즌 준비를 이어가고 있다. 이번 발표에는 대학교 의학 교육이나 지역 의료 정책 관련 사항이 전혀 포함되지 않았다.'
  );
  assert.equal(extractSeonamMediArticle(seoOnly,'https://news.example.kr/1').ready,false);
});

test('only safe public HTTPS addresses pass (incl. redirect targets)',async()=>{
  for(const u of ['http://example.kr/1','https://localhost/','https://127.0.0.1/x','https://10.1.2.3/x','https://192.168.1.1','https://[::1]/','https://user:pass@news.example.kr/','https://ekodi.kr/api/','https://news.example.kr:8443/','https://myhost.internal/']){
    assert.equal(safeImportUrl(u),null,u);
  }
  assert.equal(safeImportUrl('https://news.example.kr/a#b'),'https://news.example.kr/a');
  await assert.rejects(()=>fetchSeonamMediLinkPreview('https://news.example.kr/1',{
    fetchImpl:async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/'}})
  }),/unsafe_source_redirect/);
});

test('preview fetch and text/html only extraction, no unsafe redirect',async()=>{
  let fetched=0;
  const result=await fetchSeonamMediLinkPreview('https://news.example.kr/post',{
    fetchImpl:async(url,opts)=>{
      fetched++;assert.equal(opts.redirect,'manual');assert.equal(url,'https://news.example.kr/post');
      return new Response(goodArticle,{status:200,headers:{'content-type':'text/html; charset=UTF-8'}});
    }
  });
  assert.equal(fetched,1);assert.equal(result.ready,true);
  await assert.rejects(()=>fetchSeonamMediLinkPreview('https://news.example.kr/post',{fetchImpl:async()=>new Response('not html',{headers:{'content-type':'application/pdf'}})}),/source_not_html/);
});

test('registered administrator public page has all three operations and fail-closed source removal',async()=>{
  const [publicHtml,publicJs,adminHtml,adminJs,api,monitor]=await Promise.all([
    readFile(new URL('../sites/seonammedi/public/index.html',import.meta.url),'utf8'),
    readFile(new URL('../sites/seonammedi/public/app.js',import.meta.url),'utf8'),
    readFile(new URL('../sites/seonammedi/public/admin/index.html',import.meta.url),'utf8'),
    readFile(new URL('../sites/seonammedi/public/admin/admin.js',import.meta.url),'utf8'),
    readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8'),
    readFile(new URL('../seonammedi-monitor.js',import.meta.url),'utf8')
  ]);
  for(const id of ['timelineLinkToggle','timelineLinkForm','timelineManageToggle','timelineManageForm'])assert.match(publicHtml,new RegExp('id="'+id+'"'));
  assert.match(publicHtml,/id="timelineLinkToggle"[^>]*hidden/);
  assert.match(publicJs,/if\(admin\.has\('timeline'\)\)/);
  assert.match(publicJs,/bindPublicTimelineLinkImport/);
  assert.match(publicJs,/bindPublicMonitorContentAdmin/);
  assert.match(publicJs,/data-monitor-hide/);
  assert.match(publicJs,/\/admin\/timeline\/auto-source/);
  assert.match(api,/if\(!\(can\(auth,TIMELINE_CAP\)\|\|can\(auth,CONTENT_CAP\)\)\)return json/);
  assert.match(api,/UPDATE seonammedi_monitor_items SET review_state='rejected'/);
  assert.match(publicJs,/data-timeline-delete/);
  assert.match(adminHtml,/id="adminTimelineLinkForm"/);
  assert.match(adminJs,/bindAdminTimelineLinkImport/);
  assert.match(api,/if\(!can\(auth,TIMELINE_CAP\)\)return json/);
  assert.match(api,/\/admin\/timeline\/link-preview/);
  assert.match(api,/\/admin\/timeline\/link-import/);
  assert.match(api,/CREATE TABLE IF NOT EXISTS seonammedi_timeline_deleted/);
  assert.match(api,/if\(suppressed\)continue/);
  assert.match(api,/created_by=CASE WHEN created_by='system-seed' THEN \? ELSE created_by END/);
  assert.match(monitor,/SELECT id,title,url,resolved_url/);
  assert.equal((publicHtml.match(/id="timelineManageForm"/g)||[]).length,1);
});

test('link import uses URL hash for duplicate control and always re-fetches on submit',async()=>{
  const api=await readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8');
  assert.match(api,/const hash=await crypto\.subtle\.digest/);
  assert.match(api,/SELECT id,status FROM seonammedi_timeline WHERE legacy_key/);
  assert.match(api,/fetchSeonamMediLinkPreview\(sourceUrl\)/);
  assert.match(api,/if\(!item\.ready\)/);
  assert.match(api,/audit\(env,auth,'link_import'/);
});

test('verified original publisher committee article is news, not committee activity, with source-only summary',async()=>{
  const html=[
    '<html><head>',
    '<meta property="og:title" content="서남권 의대 비대위, 의대 추천 절차의 공정성 문제 제기">',
    '<meta name="og:description" content="전남 국립의대 공모에서 목포대 재심사를 요구하는 비상대책위원회 입장입니다.">',
    '<meta property="article:published_time" content="2026-10-12T16:08:00+09:00">',
    '<meta property="og:site_name" content="LG헬로비전">',
    '</head><body><article>서남권 의대 비상대책위원회는 전남 국립의대 후보 선정과 재심사에 대해 의견을 발표했다. 별도의 시민 의견과 근거자료는 원문에서 확인할 수 있다.</article></body></html>'
  ].join('');
  const item=extractSeonamMediArticle(html,'https://news.lghellovision.net/news/articleView.html?idxno=557927');
  assert.equal(item.ready,true);
  assert.equal(item.committeeRelated,true);
  assert.equal(item.category,'방송');
  assert.equal(item.date,'2026.10.12');
  assert.equal(item.summary.includes('별도의 시민 의견과 근거자료'),false);
  const api=await readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8');
  assert.match(api,/record_scope,committee_kind,committee_related,status/);
  assert.match(api,/item\.committeeRelated\?1:0/);
  assert.match(api,/if\(!can\(auth,TIMELINE_CAP\)\)return json\(\{ok:false,error:'timeline_forbidden'/);
});

test('committee headline without regional publisher-body evidence remains unpublishable',()=>{
  const html='<html><head><meta property="og:title" content="서남권 의대 비대위, 의대 추천 절차 공정성 문제 제기"><meta property="article:published_time" content="2026-10-12"></head><body><article>해외 아이스하키 리그 참가 선수 명단 분석이다. 전혀 관련 없는 스포츠 내용만 확인된다.</article></body></html>';
  const item=extractSeonamMediArticle(html,'https://publisher.example.kr/article');
  assert.equal(item.ready,false);
  assert.equal(item.committeeRelated,false);
});
