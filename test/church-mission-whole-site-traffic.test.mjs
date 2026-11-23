import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { trafficSiteIdForVisit } from '../traffic-intelligence.js';
import { handleTrafficIntelligence } from '../traffic-intelligence-control.js';

const ENDPOINT = 'https://ekodi.kr/api/telemetry/public-summary';
const CHURCH_PAGES = [
  '/ekodichurch/', '/ekodichurch/notices/', '/ekodichurch/notices/?post=9',
  '/ekodichurch/schedule/', '/ekodichurch/board?category=schedule',
  '/ekodichurch/board/post/9'
];
const MISSION_PAGES = [
  '/ekodimission', '/ekodimission#notices', '/ekodimission#schedule',
  '/ekodimission/board?category=mission-notice',
  '/ekodimission/board?category=mission-schedule',
  '/ekodimission/board/post/9'
];

async function productionFooterScope(path,service='root') {
  const source=await readFile(new URL('../shell/user-ui-footer.js',import.meta.url),'utf8');
  // Run the actual current read-only site-scope function in an isolated VM.
  const fn=source.match(/^function footerTrafficScope\(\)\{[\s\S]*?^\}/m)?.[0];
  assert.ok(fn,'missing whole-site footer scope function');
  const url=new URL(path,'https://ekodi.kr');
  const result=runInNewContext(fn+'\nfooterTrafficScope()',{
    URL,TRAFFIC_STATS_URL:ENDPOINT,
    USER_SURFACES:new Set(['public','workspace']),
    surface:()=> 'public',
    serviceId:()=>service,
    location:{pathname:url.pathname}
  });
  return new URL(result);
}

test('Church public home, notices, schedule and board detail all share a single Church-wide count',async()=>{
  const scopes=await Promise.all(CHURCH_PAGES.map(p=>productionFooterScope(p)));
  const keys=new Set(scopes.map(url=>url.searchParams.get('site_path')));
  assert.deepEqual([...keys],['ekodichurch']);
  for(const url of scopes){
    assert.equal(url.origin,'https://ekodi.kr');
    assert.equal(url.pathname,'/api/telemetry/public-summary');
    assert.equal(trafficSiteIdForVisit('ekodi.kr',url.searchParams.get('site_path'),url.searchParams.get('site_id')),'church');
    assert.equal(url.searchParams.has('page_path'),false);
  }
});

test('Mission public home, notices, schedule and board detail share one Mission-wide count, separate from Church',async()=>{
  const scopes=await Promise.all(MISSION_PAGES.map(p=>productionFooterScope(p,'mission')));
  assert.deepEqual([...new Set(scopes.map(url=>url.searchParams.get('site_path')))],['ekodimission']);
  for(const url of scopes){
    assert.equal(trafficSiteIdForVisit('ekodi.kr',url.searchParams.get('site_path'),url.searchParams.get('site_id')),'mission');
    assert.notEqual(url.searchParams.get('site_path'),'ekodichurch');
  }
  const church=await productionFooterScope('/ekodichurch/notices/','root');
  const mission=await productionFooterScope('/ekodimission/board?category=mission-schedule','root');
  assert.notEqual(church.searchParams.get('site_path'),mission.searchParams.get('site_path'));
});

test('Server derives site from allowlisted path, not untrusted service_id or individual page',async()=>{
  const actual=[];
  const db={prepare(sql){
    assert.match(sql,/FROM traffic_human_sessions/);
    return {bind(...args){actual.push(args);return {all:async()=>({results:[]})};}};
  }};
  const requests=[
    {path:'ekodichurch',forged:'mission',expected:'church'},
    {path:'ekodimission',forged:'church',expected:'mission'}
  ];
  for(const item of requests){
    const url=ENDPOINT+'?site_path='+item.path+'&site_id='+item.forged;
    const response=await handleTrafficIntelligence(new Request(url),{DB:db});
    assert.equal(response.status,200,item.path);
    assert.equal((await response.json()).siteId,item.expected,item.path);
  }
  assert.equal(actual[0][0],'church');
  assert.equal(actual[1][0],'mission');
});
