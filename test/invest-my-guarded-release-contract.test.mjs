import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { investMyRoute } from '../invest-my-workspace.js';

const manifest=JSON.parse(readFileSync(new URL('../deploy/manifests/my.worker.json',import.meta.url),'utf8'));
const canonical='https://ekodi.kr/invest/my';
const notices=[
  '2026년 10월 27일 국내주식 재무분석 API 7종의 종료를 공지했습니다',
  '해당 API에 의존하지 않습니다',
  '<strong id="kpiLive">잠금</strong>',
  'id="ownerSidebar"'
];

test('guarded My candidate verification enforces actual Invest guest content and live lock',()=>{
  const matches=manifest.worker.requests.filter(r=>r.url===canonical);
  assert.equal(matches.length,1,'canonical Invest GET proof must have exactly one manifest request');
  const check=matches[0];
  assert.deepEqual(check.statuses,[200]);
  assert.equal(check.redirect,'manual');
  assert.equal(check.method??'GET','GET');
  for(const proof of notices)assert.ok(check.expect.includes(proof),'missing guard '+proof);
});

test('manifest wording matches canonical Invest source without exposing logged-in holdings',async()=>{
  const response=await investMyRoute(new Request(canonical),{});
  assert.equal(response.status,200);
  const html=await response.text();
  for(const proof of notices)assert.ok(html.includes(proof),'source no longer satisfies guarded release '+proof);
  assert.doesNotMatch(html,/2026년 11월 11일 KIS 재무분석 7종 종료 예정/);
  assert.match(html,/<section id="owner" hidden>/);
  assert.doesNotMatch(html,/\/broker\/orders/);
});
