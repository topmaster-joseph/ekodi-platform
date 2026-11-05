import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../search-visibility-admin.js',import.meta.url),'utf8');

test('search visibility audit reports successes and failures separately',()=>{
  assert.match(source,/data-sv-audited>미실행/);
  assert.match(source,/data-sv-failed>미실행/);
  assert.match(source,/audits\.filter\(result=>!result\.error\)\.length/);
  assert.match(source,/audits\.filter\(result=>Boolean\(result\.error\)\)\.length/);
  assert.match(source,/const started=audits\.length>0/);
  assert.match(source,/기술점검은 버튼을 눌러 실행하며/);
  assert.match(source,/if\(state\.audited\.get\(site\.url\)\?\.error\)failed\+\+;else passed\+\+;/);
  assert.match(source,/별도 호스트 제외/);
});

test('inventory refresh clears stale technical audit results',()=>{
  assert.match(source,/state\.sites=\[\.\.\.byUrl\.values\(\)\];\s*state\.audited\.clear\(\)/);
});

test('manual provider evidence is not mislabeled as actual registration or indexing',()=>{
  assert.match(source,/수동확인 '\+confirmed\+' · 그 외 '/);
  assert.match(source,/confirmed_manually/);
  assert.doesNotMatch(source,/confirmed\+'\/4 수동 확인'/);
  assert.match(source,/검색엔진 등록·색인은 공급자 근거가 필요합니다/);
});

test('audit truth requires an exact same-origin HTML result and accepts only slash canonicalization',()=>{
  const start=source.indexOf('  const noindexDirective =');
  const end=source.indexOf('  const siteResult =',start);
  assert.ok(start>=0&&end>start,'audit helpers must remain within the source');
  let metas=[];
  class DOMParser {
    parseFromString(){
      return {
        querySelectorAll:()=>metas.map(([name,content])=>({
          getAttribute:attribute=>attribute==='name'?name:attribute==='content'?content:null,
        })),
        querySelector:()=>null,
      };
    }
  }
  const helpers=vm.runInNewContext('(function(){'+source.slice(start,end)+
    ';return {noindexDirective,validatePublicAuditResponse,checkDocument};})()',
    {URL,DOMParser});
  const site={url:'https://ekodi.kr/ekodimall'};
  const valid={text:'<html></html>',finalUrl:'https://ekodi.kr/ekodimall/',
    contentType:'text/html; charset=utf-8',robotsHeader:''};
  assert.equal(helpers.validatePublicAuditResponse(site,valid),valid.text);
  assert.equal(helpers.validatePublicAuditResponse(site,{...valid,contentType:'application/xhtml+xml'}),valid.text);
  for(const [finalUrl,contentType] of [
    ['https://ekodi.kr/auth/?return_to=/ekodimall','text/html'],
    ['https://foreign.example/ekodimall','text/html'],
    ['https://ekodi.kr/ekodimall?preview=true','text/html'],
    ['https://ekodi.kr/ekodimall','application/json'],
    ['https://ekodi.kr/ekodimall','text/plain'],
  ])assert.throws(()=>helpers.validatePublicAuditResponse(site,{...valid,finalUrl,contentType}),
    /공개 경로|HTML/,finalUrl+' must not be scored as successful public SEO audit');
  assert.equal(helpers.noindexDirective('noindex, follow'),true);
  assert.equal(helpers.noindexDirective('Googlebot: NOINDEX'),true);
  assert.equal(helpers.noindexDirective('none'),true);
  assert.equal(helpers.noindexDirective('index, follow'),false);
  assert.equal(helpers.noindexDirective('someindex'),false);
  metas=[['robots','index, follow'],['GOOGLEBOT','NOINDEX, follow']];
  assert.equal(helpers.checkDocument('synthetic').noindex,true,'Googlebot-specific meta noindex must be seen');
  metas=[['robots','index, follow']];
  assert.equal(helpers.checkDocument('synthetic',{robotsHeader:'noindex, nofollow'}).noindex,true,
    'HTTP X-Robots-Tag must override a misleading ordinary HTML index meta');
  assert.equal(helpers.checkDocument('synthetic',{robotsHeader:'index, follow'}).noindex,false);
  assert.match(source,/withResponse:true/);
  assert.match(source,/response\.headers\.get\('x-robots-tag'\)/);
  assert.match(source,/validatePublicAuditResponse\(site,receipt\)/);
  assert.match(source,/result\.noindex\?'검색로봇 noindex 지시/);
  assert.doesNotMatch(source,/method:'POST'|method:"POST"/,'technical audit is read-only');
});


test('CSV technical-audit export uses public site scope, preserves unscanned rows, and neutralizes spreadsheet formulas',()=>{
  const start=source.indexOf('  const technicalAuditCsv =');
  const end=source.indexOf('  const downloadTechnicalAudit =',start);
  assert.ok(start>0&&end>start,'pure CSV projection should be independently testable');
  const format=vm.runInNewContext('(()=>{'+source.slice(start,end)+';return technicalAuditCsv;})()', {});
  const sites=[
    {name:'에코디몰',url:'https://ekodi.kr/ekodimall',token_ciphertext:'DO-NOT-LEAK'},
    {name:'=HYPERLINK("http://attacker.invalid")',url:'https://ekodi.kr/other'},
    {name:'목대 후문',url:'https://ekodi.kr/mokdaehumun'},
    {name:'점검 실패',url:'https://ekodi.kr/unavailable'},
  ];
  const audited=new Map([
    ['https://ekodi.kr/ekodimall',{basic:'100점 (4/4)',ai:'67점 (2/3)',
      improvements:['구조화 데이터 검토'],raw:{noindex:false,privateSecret:'HIDDEN'}}],
    ['https://ekodi.kr/mokdaehumun',{basic:'75점 (3/4)',ai:'33점 (1/3)',
      improvements:['검색로봇 noindex 지시(메타·HTTP 헤더) 점검'],raw:{noindex:true}}],
    ['https://ekodi.kr/unavailable',{error:'+CMD("calc")',raw:{privateSecret:'HIDDEN'}}],
  ]);
  const csv=format(sites,audited,'2026. 11. 5. 16:50:00');
  const rows=csv.trim().split('\r\n');
  assert.equal(rows.length,5,'one header plus every registered site, including unscanned ones');
  assert.match(rows[0],/조회시각\(KST\).*기술점검 상태.*검색 차단/);
  assert.match(rows[1],/에코디몰.*점검 완료.*100점 \(4\/4\).*차단 지시 없음/);
  assert.match(rows[2],/미점검/,'no site observation must remain explicitly unknown');
  assert.match(rows[2],/'=HYPERLINK/,'dangerous name must become spreadsheet literal');
  assert.match(rows[3],/noindex 확인/);
  assert.match(rows[4],/"'\+CMD\(""calc""\)"/,'error text beginning with a formula marker must be escaped');
  assert.doesNotMatch(csv,/DO-NOT-LEAK|HIDDEN|token_ciphertext|privateSecret/);
  assert.doesNotMatch(csv,/색인 완료|등록 완료|검색 실적/);
});

test('CSV export only activates after an audit and remains a local, read-only download',()=>{
  assert.match(source,/data-sv-export disabled/);
  assert.match(source,/exportButton\.disabled=state\.busy\|\|!started/);
  assert.match(source,/state\.audited\.size/);
  assert.match(source,/new Blob\(\['\\uFEFF',csv\],\{type:'text\/csv;charset=utf-8'\}\)/);
  assert.match(source,/URL\.createObjectURL\(blob\)/);
  assert.match(source,/URL\.revokeObjectURL\(href\)/);
  assert.match(source,/addEventListener\('click',downloadTechnicalAudit\)/);
  const start=source.indexOf('  const technicalAuditCsv =');
  const end=source.indexOf('  const siteResult =',start);
  const exportCode=source.slice(start,end);
  assert.doesNotMatch(exportCode,/fetch\(|XMLHttpRequest|\.send\(|postMessage\(/);
  assert.match(exportCode,/검색엔진 등록·색인 여부는 포함하지 않습니다/);
});
