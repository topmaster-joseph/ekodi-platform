import test from 'node:test';
import assert from 'node:assert/strict';
import { investMyRoute } from '../invest-my-workspace.js';

// Official KIS Developers notice dated 2026-10-27. Do not display a past
// 2026-11-11 shutdown as an upcoming event or imply verified live market data.
test('owner Invest surfaces show the dated KIS API retirement notice without stale future wording', async () => {
  for (const route of ['/invest/my', '/invest/my/value']) {
    const response = await investMyRoute(new Request('https://ekodi.kr' + route), {});
    assert.equal(response.status, 200, route);
    const html = await response.text();
    assert.match(html, /2026년 10월 27일 국내주식 재무분석 API 7종의 종료를 공지했습니다/);
    assert.doesNotMatch(html, /2026년 11월 11일 KIS 재무분석 7종 종료 예정/);
    assert.match(html, /해당 API에 의존하지 않습니다/);
    assert.match(html, /<strong id="kpiLive">잠금<\/strong>/);
    assert.match(html, /<section id="owner" hidden>/);
  }
});
