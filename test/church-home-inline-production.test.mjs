import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyChurchInlineProduction,CHURCH_ORIGIN} from '../scripts/verify-church-homepage-production.mjs';

const sha='8352b3ddaa82aa9b2e86dd2af037ca1afc6252a4';
function fixture(overrides={}){
  return {
    '/ekodichurch/church-release.json':JSON.stringify({
      contract:'ekodi.church-release.v1',sourceRepository:'topmaster-joseph/ekodi-church',sourceSha:sha
    }),
    '/ekodichurch/':[
      '<a href="/ekodichurch/notices/">공지사항</a>',
      '<a href="/ekodichurch/schedule/">주요일정</a>',
      '<button data-church-inline-manage="notices" hidden>바로 관리</button>',
      '<button data-church-inline-manage="schedule" hidden>바로 관리</button>',
      '<section data-church-public-manage data-church-home-manage hidden></section>',
      '<p data-church-role-diagnostic role="status" hidden></p>',
      '<section data-church-shared-schedules></section>',
      '<script src="church-public-updates.js"></script>'
    ].join(''),
    '/ekodichurch/notices/':'<body data-church-public-page="notices"></body>',
    '/ekodichurch/schedule/':'<body data-church-public-page="schedule"></body>',
    '/ekodichurch/church-public-updates.js':[
      "if(result.authenticated!==true)return; if(result.manage!==true||!['owner','admin','moderator'].includes(result.role))return;",
      "function explainRole(kind=''){}; explainRole('unauthorized');", 
      "function revokeEditor(){}",
      "document.addEventListener('church:public-content-updated',loadData)",
      "if(item.source==='board')editRecord(item)"
    ].join('\n'),
    '/ekodichurch/church-public-updates.css':'.church-home-manage-toggle{}',
    '/ekodichurch/church-homepage-layout.css':'@media(max-width:540px){body:not(:has(main :target)) main > .hero{padding:42px 14px 30px!important}}',
    '/ekodichurch/church-shared-schedules.js':"if(mode!=='published-read-only')return;",
    ...overrides
  };
}
function transport(overrides={}){
  const sources=fixture(overrides),requests=[];
  const fetchImpl=async (url,options)=>{
    const path=new URL(url).pathname;
    requests.push({url,options,path});
    return {status:sources[path]===undefined?404:200,text:async()=>sources[path]||''};
  };
  return {fetchImpl,requests};
}
test('approved Church source is tested by GET-only, source-pinned production proof',async()=>{
  const {fetchImpl,requests}=transport();
  const result=await verifyChurchInlineProduction({expectedSourceSha:sha,fetchImpl,now:()=> '2026-11-22T00:00:00.000Z'});
  assert.equal(result.ok,true);
  assert.equal(result.verifiedSourceSha,sha);
  assert.equal(result.realUserAuthenticated,false);
  assert.equal(result.dataMutations,false);
  assert.equal(result.loggedInCrudVerified,false);
  assert.equal(result.checks.length,9);
  assert.equal(requests.length,8);
  for(const r of requests){
    assert.equal(new URL(r.url).origin,CHURCH_ORIGIN);
    assert.equal(new URL(r.url).searchParams.get('release'),sha);
    assert.equal(r.options.method,'GET');
    assert.equal(r.options.cache,'no-store');
    assert.ok(!('authorization' in r.options.headers));
  }
});
test('reject older mobile hero clearance that overlaps localized 320px header',async()=>{
  const oldLayout=transport({'/ekodichurch/church-homepage-layout.css':'@media(max-width:540px){body:not(:has(main :target)) main > .hero{padding:22px 14px 30px!important}}'});
  await assert.rejects(()=>verifyChurchInlineProduction({expectedSourceSha:sha,fetchImpl:oldLayout.fetchImpl}),/mobile 320px localized greeting clearance/);
});
test('reject mismatched deployed revision, never confuse old production with successful promotion',async()=>{
  const {fetchImpl}=transport({'/ekodichurch/church-release.json':JSON.stringify({
    contract:'ekodi.church-release.v1',sourceRepository:'topmaster-joseph/ekodi-church',sourceSha:'b77967cb1fd5c8a525079d3b42e48689897f92ea'
  })});
  await assert.rejects(()=>verifyChurchInlineProduction({expectedSourceSha:sha,fetchImpl}),/deployed SHA mismatch/);
});
test('reject a manager button visible by default and missing role server check',async()=>{
  const shown=transport({'/ekodichurch/':fixture()['/ekodichurch/'].replace('data-church-inline-manage="schedule" hidden','data-church-inline-manage="schedule"')});
  await assert.rejects(()=>verifyChurchInlineProduction({expectedSourceSha:sha,fetchImpl:shown.fetchImpl}),/default-hidden schedule manager button/);
  const noRole=transport({'/ekodichurch/church-public-updates.js':'const role = "any";'});
  await assert.rejects(()=>verifyChurchInlineProduction({expectedSourceSha:sha,fetchImpl:noRole.fetchImpl}),/server verified authentication/);
});
test('fail closed on missing official route and require exact canonical origin',async()=>{
  const missing=transport({'/ekodichurch/notices/':undefined});
  await assert.rejects(()=>verifyChurchInlineProduction({expectedSourceSha:sha,fetchImpl:missing.fetchImpl}),/notices/);
  await assert.rejects(()=>verifyChurchInlineProduction({expectedSourceSha:sha,fetchImpl:transport().fetchImpl,origin:'https://attacker.invalid'}),/canonical ekodi.kr/);
  await assert.rejects(()=>verifyChurchInlineProduction({expectedSourceSha:'not-a-sha'}),/pinned, approved Church source SHA/);
});
