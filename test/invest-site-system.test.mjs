import test from 'node:test';
import assert from 'node:assert/strict';
import { INVEST_ASSET_SITES, investSiteForPath, routeInvestSite } from '../invest-site-system.js';
import { INVEST_AUTOMATION_LOOP } from '../invest-automation-runtime.js';

test('Invest exposes one canonical hub with specialized asset subpaths',()=>{
  const paths=INVEST_ASSET_SITES.map(site=>site.path);
  assert.deepEqual(paths,[
    '/invest','/invest/personal','/invest/stock','/invest/bond','/invest/real-estate',
    '/invest/fund','/invest/alternative','/invest/portfolio','/invest/automation'
  ]);
  assert.equal(investSiteForPath('/invest/stock')?.id,'stock');
  assert.equal(investSiteForPath('/invest/real-estate/')?.id,'real-estate');
});

test('personal investment control is private-by-default and uses shared Invest APIs',async()=>{
  const page=routeInvestSite(new Request('https://ekodi.kr/invest/personal'));
  assert.equal(page.status,200);
  assert.match(page.headers.get('cache-control')||'',/no-store/);
  assert.match(page.headers.get('x-robots-tag')||'',/noindex/);
  const html=await page.text();
  assert.match(html,/PERSONAL INVESTMENT OS/);
  assert.match(html,/자동운용 즉시 정지/);
  const script=routeInvestSite(new Request('https://ekodi.kr/invest/assets/personal.js'));
  const js=await script.text();
  assert.match(js,/\/workspace-api\/v1\/invest/);
  assert.match(js,/\/automation\/halt/);
  assert.match(js,/\/automation\/resume/);
});

test('autonomous loop is explicit and risk gate precedes execution',()=>{
  assert.deepEqual(INVEST_AUTOMATION_LOOP,[
    'market_watch','opportunity_discovery','specialist_analysis','dissent_review','allocation',
    'risk_governor','execution_gate','fill_monitor','performance_review','rebalance'
  ]);
  assert.ok(INVEST_AUTOMATION_LOOP.indexOf('risk_governor')<INVEST_AUTOMATION_LOOP.indexOf('execution_gate'));
});
test('specialized sites render their own engines and automation stays simulation-first',async()=>{
  const stock=routeInvestSite(new Request('https://ekodi.kr/invest/stock'));
  assert.equal(stock.status,200);
  const stockHtml=await stock.text();
  assert.match(stockHtml,/Stock Engine/);
  assert.match(stockHtml,/Multi-Broker Hub/);
  assert.match(stockHtml,/내 투자관리/);
  const automation=routeInvestSite(new Request('https://ekodi.kr/invest/automation'));
  const automationHtml=await automation.text();
  assert.match(automationHtml,/Autonomous Loop/);
  assert.match(automationHtml,/Shadow\/Simulation/);
  assert.match(automationHtml,/Supervisor AI/);
});

test('Invest admin converges into the canonical central administrator',()=>{
  const response=routeInvestSite(new Request('https://ekodi.kr/invest/admin'));
  assert.equal(response.status,302);
  const target=new URL(response.headers.get('location'));
  assert.equal(target.origin,'https://ekodi.kr');
  assert.equal(target.pathname,'/admin/');
  assert.equal(target.searchParams.get('route'),'invest');
});

test('unknown Invest child paths fail closed',()=>{
  const response=routeInvestSite(new Request('https://ekodi.kr/invest/not-real'));
  assert.equal(response.status,404);
});
