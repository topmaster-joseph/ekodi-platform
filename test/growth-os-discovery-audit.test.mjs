import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderRobotsTxt, renderSitemapXml } from '../discovery-layer.js';
import { discoveryTargetForSubject, analyzeGrowthDiscoveryEvidence, verifyGrowthDiscovery } from '../ekodi-growth-discovery-audit.js';

const tenant = { type:'tenant', key:'ekodimall' };
const html = `<!doctype html><html><head>
  <title>EKODI Mall</title>
  <link rel="canonical" href="https://ekodi.kr/ekodimall">
  <meta name="description" content="사람과 상품을 연결합니다.">
  <meta property="og:title" content="EKODI Mall">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite"}</script>
  </head><body>공개 상품정보</body></html>`;
const sources = {
  '/ekodimall': [200,html,'text/html'],
  '/robots.txt': [200,renderRobotsTxt(),'text/plain'],
  '/sitemap.xml': [200,renderSitemapXml(),'application/xml'],
};
function mockFetch(requests = [], overrides = {}) {
  return async (url,init) => {
    requests.push({url,init});
    const {pathname,hostname} = new URL(url);
    assert.equal(hostname,'ekodi.kr');
    assert.equal(init.redirect,'manual');
    assert.equal(init.method,'GET');
    assert.equal(init.headers?.authorization,undefined);
    assert.equal(init.headers?.cookie,undefined);
    const [status,text,type] = overrides[pathname] || sources[pathname] || [404,'not found','text/plain'];
    return new Response(text,{status,headers:{'content-type':type}});
  };
}

test('tenant is resolved by declared public route, never from caller supplied URLs', () => {
  assert.deepEqual(discoveryTargetForSubject(tenant),{
    path:'/ekodimall',url:'https://ekodi.kr/ekodimall',source:'DISCOVERY_PUBLIC_ROUTES',
  });
  assert.equal(discoveryTargetForSubject({type:'tenant',key:'https://attacker.example'}),null);
  assert.equal(discoveryTargetForSubject({type:'person',key:'ekodimall'}),null);
  assert.equal(discoveryTargetForSubject({type:'tenant',key:'admin'}),null);
  assert.equal(discoveryTargetForSubject({type:'tenant',key:'../../api/session'}),null);
  assert.equal(discoveryTargetForSubject({type:'tenant',key:'unlisted-tenant'}),null);
});

test('live public proof reports technical checks, but not search impressions or AI citations', async () => {
  const requests = [];
  const out = await verifyGrowthDiscovery(tenant,{fetchImpl:mockFetch(requests),now:()=>'2026-10-25T19:00:00+09:00'});
  assert.equal(out.ok,true);
  assert.equal(out.status,'checks_passed',JSON.stringify(out.findings));
  assert.equal(out.checks.canonicalMatches,true);
  assert.equal(out.checks.answerAndSearchBotsAllowed,true);
  assert.equal(out.checks.trainingBotRestricted,true);
  assert.equal(out.checks.hasStructuredData,true);
  assert.equal(out.checks.listedInSitemap,true);
  assert.equal(out.observations.aiCitations,null);
  assert.equal(out.observations.organicConversions,null);
  assert.equal(requests.length,3);
  assert.deepEqual(requests.map(q=>q.url).sort(),[
    'https://ekodi.kr/ekodimall','https://ekodi.kr/robots.txt','https://ekodi.kr/sitemap.xml'
  ].sort());
});

test('unauthorized/unregistered route never performs any network read', async () => {
  let called = false;
  const out = await verifyGrowthDiscovery({type:'tenant',key:'unknown-customer'},{
    fetchImpl:async () => {called = true;throw Error('NEVER');}
  });
  assert.equal(out.status,'public_route_not_registered');
  assert.equal(out.target,null);
  assert.equal(out.observations.searchImpressions,null);
  assert.equal(called,false);
});

test('redirects and noindex are visible failures; never follow to arbitrary hosts', async () => {
  const requests=[];
  const noIndexHtml = html.replace('</head>','<meta name="robots" content="noindex"></head>');
  const out = await verifyGrowthDiscovery(tenant,{
    fetchImpl:mockFetch(requests,{'/ekodimall':[200,noIndexHtml,'text/html'],
      '/sitemap.xml':[200,'<?xml version="1.0"?><urlset></urlset>','application/xml']})
  });
  assert.equal(out.status,'issues_found');
  assert.ok(out.findings.some(x=>x.id==='index_blocked'));
  assert.ok(out.findings.some(x=>x.id==='not_listed_in_root_sitemap'));
  const redirect = await verifyGrowthDiscovery(tenant,{
    fetchImpl:mockFetch([],{'/ekodimall':[302,'redirect','text/html']})
  });
  assert.equal(redirect.status,'issues_found');
  assert.equal(redirect.checks.http200,false);
});

test('response size cap and network errors fail closed without secrets', async () => {
  const fail = await verifyGrowthDiscovery(tenant,{
    fetchImpl:async () => new Response('too large',{status:200,headers:{'content-length':'999999'}})
  });
  assert.equal(fail.ok,false);
  assert.equal(fail.errorCode,'RESPONSE_TOO_LARGE');
  assert.equal(fail.checks,null);
  assert.equal(JSON.stringify(fail).includes('too large'),false);
});

test('Growth OS discovery audit is protected by the existing authSubject gate', () => {
  const worker=readFileSync(new URL('../marketing-growth-worker.js',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../marketing-ai-admin.js',import.meta.url),'utf8');
  const gate=worker.indexOf('const auth = await authSubject(request,env,write);');
  const route=worker.indexOf("url.pathname === '/v1/growth-os/discovery/verify'");
  assert.ok(gate>0 && route>gate);
  assert.match(worker.slice(route,route+280),/verifyGrowthDiscovery\(subject\)/);
  assert.match(ui,/data-growth-discovery-verify/);
  assert.match(ui,/verifyGrowthOsDiscovery\(\)/);
  assert.match(ui,/검색 순위·AI 추천·AI 인용·전환을 보장하거나 추정하지 않습니다/);
});
