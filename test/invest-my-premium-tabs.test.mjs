import test from 'node:test';
import assert from 'node:assert/strict';
import { investMyRoute } from '../invest-my-workspace.js';

test('my invest shows a Korean KPI strip and eight accessible button tabs with the live lock always visible', async () => {
  const html = await (await investMyRoute(new Request('https://ekodi.kr/invest'), {})).text();
  for (const id of ['kpiAuth', 'kpiBroker', 'kpiPaper', 'kpiLive', 'kpiUpdated']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /<strong id="kpiLive">잠금<\/strong>/);
  const tabs = [...html.matchAll(/role="tab" data-tab="([a-z]+)"/g)].map(m => m[1]);
  assert.deepEqual(tabs, ['summary', 'market', 'broker', 'autopilot', 'analysis', 'research', 'live', 'report']);
  assert.match(html, /role="tablist" aria-label="마이투자 기능"/);
  // Korean-first: decorative English headings replaced
  assert.doesNotMatch(html, /PRIVATE INVESTMENT STUDIO|EKODI AI PRIVATE WEALTH|>LOCAL</);
  // owner tools stay hidden until both factors succeed
  assert.match(html, /<section id="owner" hidden>/);
});

test('client routes sidebar hashes to the owning tab and never hides the summary strip', async () => {
  const js = await (await investMyRoute(new Request('https://ekodi.kr/invest/app.js'), {})).text();
  assert.ok(js.includes("node.id==='ownerSummary'||node.id==='ownerTabs'||node.id==='ownerSubtabs'"),'KPI and tab controls remain visible regardless of selection');
  assert.ok(js.includes("broker:[['brokerReadonly','증권사 잔고 조회']]"),'broker owner section resolves from canonical registry');
  assert.ok(js.includes("live:[['liveTrading','AI 실거래 준비']]"),'live readiness remains a separate owner section');
  assert.ok(js.includes("report:[['export','보고서 내보내기']]"),'report export remains available');
  assert.match(js, /if\(tabFor\(node\)==='\*'\)continue/,'global owner controls are never section-hidden');
  assert.match(js, /addEventListener\('hashchange'/);
  assert.match(js, /kpi\('kpiPaper','확인 불가','warn'\)/);
  assert.doesNotMatch(js, /innerHTML|localStorage\.setItem|sessionStorage\.setItem/);
});
