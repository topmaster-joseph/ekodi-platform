import test from 'node:test';
import assert from 'node:assert/strict';
import { investMyRoute } from '../invest-my-workspace.js';

test('my invest shows a Korean KPI strip and six button tabs with the live lock always visible', async () => {
  const html = await (await investMyRoute(new Request('https://ekodi.kr/invest'), {})).text();
  for (const id of ['kpiAuth', 'kpiBroker', 'kpiPaper', 'kpiLive', 'kpiUpdated']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /<strong id="kpiLive">잠금<\/strong>/);
  const tabs = [...html.matchAll(/role="tab" data-tab="([a-z]+)"/g)].map(m => m[1]);
  assert.deepEqual(tabs, ['summary', 'broker', 'autopilot', 'analysis', 'live', 'report']);
  assert.match(html, /role="tablist" aria-label="마이투자 기능"/);
  // Korean-first: decorative English headings replaced
  assert.doesNotMatch(html, /PRIVATE INVESTMENT STUDIO|EKODI AI PRIVATE WEALTH|>LOCAL</);
  // owner tools stay hidden until both factors succeed
  assert.match(html, /<section id="owner" hidden>/);
});

test('client routes sidebar hashes to the owning tab and never hides the summary strip', async () => {
  const js = await (await investMyRoute(new Request('https://ekodi.kr/invest/app.js'), {})).text();
  assert.match(js, /ownerSummary:'\*',ownerTabs:'\*'/);
  assert.match(js, /brokerReadonly:'broker'/); assert.match(js, /liveTrading:'live'/); assert.match(js, /export:'report'/);
  assert.match(js, /addEventListener\('hashchange'/);
  assert.match(js, /kpi\('kpiPaper','확인 불가','warn'\)/);
  assert.doesNotMatch(js, /innerHTML|localStorage\.setItem|sessionStorage\.setItem/);
});
