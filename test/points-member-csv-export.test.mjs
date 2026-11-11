import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('my/points/app.js'),html=read('my/points/index.html'),css=read('my/points/styles.css');
const helpers=app.split('// POINTS_MEMBER_EXPORT_BEGIN:')[1]?.replace(/^[^\n]*\n/,'').split('// POINTS_MEMBER_EXPORT_END')[0];
assert.ok(helpers,'Pure CSV helper contract must exist');
const {csvCell,buildHistoryCsv}=runInNewContext(helpers+'\n({csvCell,buildHistoryCsv})');

test('CSV escapes formulas, quotes and line breaks for spreadsheet applications',()=>{
  assert.equal(csvCell('=HYPERLINK("https://example.com")'),'"\'=HYPERLINK(""https://example.com"")"');
  assert.equal(csvCell(' \t+SUM(1,1)'),'"\' \t+SUM(1,1)"');
  assert.equal(csvCell('@danger'),'"\'@danger"');
  assert.equal(csvCell('ordinary "text"'),'"ordinary ""text"""');
});
test('CSV contains only validated server-history projection, signed amounts and Korea dates',()=>{
  const csv=buildHistoryCsv([
    {created_at:'2026-11-11T00:00:00Z',event_kind:'earn',amount:25},
    {created_at:'2026-11-11T01:00:00Z',event_kind:'spend',amount:-10},
    {created_at:'invalid',event_kind:'earn',amount:77},
    {created_at:'2026-11-11T02:00:00Z',event_kind:'earn',amount:'=HYPERLINK(1)'},
  ]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv,/거래 종류/);
  assert.match(csv,/"적립",25\r\n/);
  assert.match(csv,/"사용",-10\r\n/);
  assert.doesNotMatch(csv,/77|HYPERLINK/);
  assert.match(csv,/2026/);
  assert.ok(csv.endsWith('\r\n'));
});
test('export stays private to the selected authenticated wallet revision',()=>{
  assert.match(html,/id="exportPointsHistory"[^>]*hidden disabled/);
  assert.match(html,/현재 사이트에서 조회된 최근 거래만 내려받습니다/);
  assert.match(app,/snapshot\.site!==select\.value/);
  assert.match(app,/snapshot\.revision!==viewRevision/);
  assert.match(app,/await sb\.auth\.getSession\(\)/);
  assert.match(app,/function clearHistoryExport\(\)/);
  assert.match(app,/historyList\.replaceChildren\(\);clearProgress\(\);showReferralControls/);
  assert.match(app,/setHistoryExport\(data\.history,site,revision\)/);
  assert.doesNotMatch(helpers,/localStorage|sessionStorage|fetch\(|sb\.rpc|award_evidence|innerHTML/);
  assert.match(css,/\.points-export\[hidden\]/);
});
