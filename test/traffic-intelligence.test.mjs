import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTrafficIntelligence } from '../traffic-intelligence-control.js';
import { readFile } from 'node:fs/promises';
import {
  classifyTrafficUserAgent,
  isAllowedTelemetryOrigin,
  trafficSiteIdForHost,
  trafficSiteIdForVisit,
  ROOT_PATH_SITE_IDS,
} from '../traffic-intelligence.js';

test('EKODI automation is separated from public crawlers and unknown browsers', () => {
  assert.equal(classifyTrafficUserAgent('EKODI-Monitor/3.2').category, 'ekodi_internal');
  assert.equal(classifyTrafficUserAgent('EKODI-Bounded-Load-Test/1.0 (+https://ekodi.kr)').category, 'ekodi_internal');
  assert.equal(classifyTrafficUserAgent('Mozilla/5.0 compatible Googlebot/2.1').category, 'search_bot');
  assert.equal(classifyTrafficUserAgent('OAI-SearchBot/1.0').category, 'search_bot');
  assert.equal(classifyTrafficUserAgent('Claude-SearchBot/1.0').category, 'search_bot');
  assert.equal(classifyTrafficUserAgent('Go-http-client/1.1').category, 'other_bot');
  assert.equal(classifyTrafficUserAgent('curl/8.13.0').category, 'other_bot');
  assert.equal(classifyTrafficUserAgent('HeadlessChrome/151.0').category, 'other_bot');
  assert.equal(classifyTrafficUserAgent('Mozilla/5.0 Chrome/151.0 Safari/537.36').category, 'unclassified');
});

test('site mapping handles EKODI and legacy managed domains', () => {
  assert.equal(trafficSiteIdForHost('church.ekodi.kr'), 'church');
  assert.equal(trafficSiteIdForHost('ekodichurch.kr'), 'church');
  assert.equal(trafficSiteIdForHost('cgma.or.kr'), 'cgma');
  assert.equal(trafficSiteIdForHost('ekodi.kr'), 'root');
});
test('telemetry origin policy allows managed HTTPS surfaces only', () => {
  assert.equal(isAllowedTelemetryOrigin('https://church.ekodi.kr'), true);
  assert.equal(isAllowedTelemetryOrigin('https://ekodichurch.kr'), true);
  assert.equal(isAllowedTelemetryOrigin('http://church.ekodi.kr'), false);
  assert.equal(isAllowedTelemetryOrigin('https://evil.example'), false);
  assert.equal(isAllowedTelemetryOrigin('https://customer.example', 'https://customer.example'), true);
});

test('storage contract contains aggregates and daily hashes, not raw request identity', async () => {
  const migration = await readFile('migrations/0059_traffic_intelligence.sql', 'utf8');
  assert.match(migration, /traffic_intelligence_daily/);
  assert.match(migration, /traffic_human_sessions/);
  assert.match(migration, /session_hash/);
  assert.doesNotMatch(migration, /client_ip|request_path|raw_log|user_agent/i);

  const control = await readFile('traffic-intelligence-control.js', 'utf8');
  assert.doesNotMatch(control, /cf-connecting-ip|x-forwarded-for|headers\.get\(['"]user-agent/i);
  assert.match(control, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(control, /last_seen_at/);
  assert.match(control, /visit_count/);
  assert.match(control, /ON CONFLICT\(day, host, session_hash\) DO UPDATE/);
  assert.doesNotMatch(control, /cf-connecting-ip|x-forwarded-for|headers\.get\(['"]user-agent/i);
});

test('browser beacon respects privacy signals and classifier collector is daily aggregate only', async () => {
  const shell = await readFile('shell/shell.js', 'utf8');
  assert.match(shell, /globalPrivacyControl/);
  assert.match(shell, /doNotTrack/);
  assert.match(shell, /api\/telemetry\/visit/);
  assert.match(shell, /sendBeacon/);

  const collector = await readFile('scripts/collect-traffic-intelligence.mjs', 'utf8');
  assert.match(collector, /86400000/);
  assert.match(collector, /httpRequestsAdaptiveGroups/);
  assert.doesNotMatch(collector, /client_ip|request_path|raw_log/i);
});

test('collector isolates unavailable zones and preserves partial analytics', async () => {
  const collector = await readFile('scripts/collect-traffic-intelligence.mjs', 'utf8');
  assert.match(collector, /let collectedZoneCount = 0/);
  assert.match(collector, /const skippedZones = \[\]/);
  assert.match(collector, /try \{[\s\S]*collectZone\(zone, window\)[\s\S]*catch \(error\)/);
  assert.match(collector, /const stateStatus = skippedZones\.length \? 'partial' : 'ok'/);
  assert.match(collector, /if \(collectedZoneCount === 0\)/);
  assert.match(collector, /last_success_at=excluded\.last_success_at/);
});

test('canonical child paths attribute browser visits without treating all ekodi.kr traffic as root', () => {
  assert.equal(trafficSiteIdForVisit('ekodi.kr', 'ekodichurch', 'church'), 'church');
  assert.equal(trafficSiteIdForVisit('ekodi.kr', 'ekodimission', 'mission'), 'mission');
  assert.equal(trafficSiteIdForVisit('ekodi.kr', 'ekodimall', 'mall'), 'mall');
  assert.equal(trafficSiteIdForVisit('ekodi.kr', 'ekodibiz/trade', 'biz'), 'trade');
  assert.equal(trafficSiteIdForVisit('ekodi.kr', 'ekodibiz/marketing-ai', 'biz'), 'marketing');
  assert.equal(trafficSiteIdForVisit('ekodi.kr', 'cgma', 'cgma'), 'cgma');
  assert.equal(trafficSiteIdForVisit('ekodi.kr', '/ai/', 'ai'), 'ai');
  assert.equal(trafficSiteIdForVisit('ekodi.kr', 'admin', 'mission'), 'root');
  assert.equal(trafficSiteIdForVisit('ekodi.kr', 'unknown-path', 'mission'), 'root');
  assert.equal(trafficSiteIdForVisit('ekodi.kr', 'ekodichurch/user123', 'mall'), 'church');
  assert.equal(trafficSiteIdForVisit('ekodi.kr', '', 'mission'), 'mission');
  assert.equal(trafficSiteIdForVisit('ekodi.kr', '', 'made-up-site'), 'root');
  assert.equal(trafficSiteIdForVisit('seonammedi.kr', '', 'mission'), 'seonammedi');
  assert.equal(trafficSiteIdForVisit('ekodichurch.kr', 'ekodimall', 'mall'), 'church');
});
test('shared shell sends only the site route and the daily admin report marks request scope', async () => {
  const shell = await readFile('shell/shell.js', 'utf8');
  assert.match(shell, /site_path:first\+child/);
  assert.doesNotMatch(shell, /site_path:location\.pathname/);
  const controller = await readFile('traffic-intelligence-control.js', 'utf8');
  assert.match(controller, /trafficSiteIdForVisit\(host, body\?\.site_path, body\?\.site_id\)/);
  assert.match(controller, /cloudflareRequests:'host-scoped/);
  assert.match(controller, /activeConcurrency:'not measured/);
});

test('browser telemetry may transmit only declared service routes, never arbitrary slugs',async()=>{
  const shell=await readFile('shell/shell.js','utf8');
  const rootsMatch=shell.match(/const trafficKnownRoots=new Set\('([^']+)'\.split\(' '\)\)/);
  assert.ok(rootsMatch,'canonical route whitelist must be present in the browser shell');
  const browserRoots=rootsMatch[1].split(' ');
  const canonicalRoots=Object.keys(ROOT_PATH_SITE_IDS).filter(key=>!key.includes('/'));
  assert.deepEqual([...new Set(browserRoots)].sort(),canonicalRoots.sort(),'browser and backend site roots must stay in sync');
  assert.match(shell,/const first=trafficKnownRoots\.has\(routeRoot\)\?routeRoot:''/);
  assert.match(shell,/site_path:first\+child/);
  assert.doesNotMatch(shell,/site_path:location\.pathname/);
});

test('real visit handler preserves independent anonymous sessions across sibling sites',async()=>{
  const rows=[];
  const db={prepare(sql){
    assert.match(sql,/INSERT INTO traffic_human_sessions/);
    return {bind(...values){return {async run(){rows.push(values);return {success:true}}}}};
  }};
  const session='visitor_session_1234567890123456789012345';
  async function visit(sitePath){
    const req=new Request('https://ekodi.kr/api/telemetry/visit',{
      method:'POST',
      headers:{origin:'https://ekodi.kr','content-type':'text/plain'},
      body:JSON.stringify({sid:session,site_id:'root',site_path:sitePath,surface:'home'})
    });
    return handleTrafficIntelligence(req,{DB:db});
  }
  const church=await visit('ekodichurch');
  const mall=await visit('ekodimall');
  assert.equal(church.status,204);
  assert.equal(mall.status,204);
  assert.equal(rows.length,2);
  assert.equal(rows[0][2],'church');
  assert.equal(rows[1][2],'mall');
  assert.notEqual(rows[0][3],rows[1][3],'site-specific hashes must not collide or overwrite another site');
  assert.equal(rows[0][0],rows[1][0]);
  for(const row of rows){
    assert.equal(row[1],'ekodi.kr');
    assert.match(row[3],/^[a-f0-9]{32}$/);
    assert.ok(!row.includes(session),'no raw browser sid should be persisted');
  }
});

test('anonymous OPTIONS telemetry probe reveals version without accessing or writing D1',async()=>{
  const request=new Request('https://ekodi.kr/api/telemetry/visit',{
    method:'OPTIONS',headers:{
      origin:'https://ekodi.kr',
      'access-control-request-method':'POST'
    }
  });
  let touched=false;
  const env={DB:{prepare(){touched=true;throw new Error('D1 must not be touched')}}};
  const response=await handleTrafficIntelligence(request,env);
  assert.equal(response.status,204);
  assert.equal(response.headers.get('x-ekodi-traffic-telemetry'),'site-scoped-v2');
  assert.equal(response.headers.get('access-control-allow-origin'),'https://ekodi.kr');
  assert.equal(response.headers.get('access-control-allow-methods'),'POST, OPTIONS');
  assert.equal(touched,false);
});
