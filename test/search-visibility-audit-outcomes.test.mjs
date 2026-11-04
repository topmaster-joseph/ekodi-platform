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
