import test from 'node:test';
import assert from 'node:assert/strict';
import { investMyRoute } from '../invest-my-workspace.js';

test('my invest keeps the KPI strip and hides redundant top tabs in favor of the primary sidebar', async () => {
  const html = await (await investMyRoute(new Request('https://ekodi.kr/invest'), {})).text();
  for (const id of ['kpiAuth', 'kpiBroker', 'kpiPaper', 'kpiLive', 'kpiUpdated']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /<strong id="kpiLive">잠금<\/strong>/);
  const tabs = [...html.matchAll(/role="tab" data-tab="([a-z]+)"/g)].map(m => m[1]);
  assert.deepEqual(tabs, ['summary', 'market', 'broker', 'autopilot', 'analysis', 'research', 'live', 'report']);
  assert.match(html, /id="ownerTabs" class="tabs" hidden role="tablist"/);
  assert.match(html, /href="#manualOrder">직접투자/);
  assert.match(html, /href="#autopilot">AI 자동투자/);
  assert.match(html, /href="#strategyLab">투자 분석·연구/);
  // Korean-first: decorative English headings replaced
  assert.doesNotMatch(html, /PRIVATE INVESTMENT STUDIO|EKODI AI PRIVATE WEALTH|>LOCAL</);
  // owner tools stay hidden until both factors succeed
  assert.match(html, /<section id="owner" hidden>/);
});

test('client routes sidebar hashes to the owning tab and never hides the summary strip', async () => {
  const js = await (await investMyRoute(new Request('https://ekodi.kr/invest/app.js'), {})).text();
  assert.match(js, /ownerSummary:'\*',ownerTabs:'\*'/);
  assert.match(js, /const DETAIL_GROUPS=\{/);
  assert.match(js, /manual:\[\['manualOrder','주문 준비'\]/);
  assert.match(js, /auto:\[\['autopilot','모의운용 현황'\]/);
  assert.match(js, /report:\[\['export','보고서'\]/);
  assert.match(js, /addEventListener\('hashchange'/);
  assert.match(js, /kpi\('kpiPaper','확인 불가','warn'\)/);
  assert.doesNotMatch(js, /innerHTML|localStorage\.setItem|sessionStorage\.setItem/);
});
