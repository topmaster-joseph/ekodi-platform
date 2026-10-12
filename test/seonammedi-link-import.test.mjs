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
  assert.match(publicJs,/state:'rejected'/);
  assert.match(publicJs,/data-timeline-delete/);
  assert.match(adminHtml,/id="adminTimelineLinkForm"/);
  assert.match(adminJs,/bindAdminTimelineLinkImport/);
  assert.match(api,/if\(!can\(auth,TIMELINE_CAP\)\)return json/);
  assert.match(api,/\/admin\/timeline\/link-preview/);
  assert.match(api,/\/admin\/timeline\/link-import/);
  assert.match(api,/CREATE TABLE IF NOT EXISTS seonammedi_timeline_deleted/);
  assert.match(api,/if\(suppressed\)continue/);
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
