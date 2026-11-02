import test from 'node:test';
import assert from 'node:assert/strict';
import { investMyRoute } from '../invest-my-workspace.js';

const url=(path)=>new Request('https://ekodi.kr'+path);
const html=async()=>((await investMyRoute(url('/invest'),{})).text());
const js=async()=>((await investMyRoute(url('/invest/app.js'),{})).text());
const css=async()=>((await investMyRoute(url('/invest/style.css'),{})).text());

test('market dashboard adapts requested metrics-tabs-search-table-export structure without invented market quotes',async()=>{
 const page=await html();
 assert.match(page,/id="marketDashboard"/);
 assert.match(page,/id="marketTitle"/);
 assert.match(page,/KOSPI/);
 assert.match(page,/KOSDAQ/);
 assert.match(page,/시세 공급원 미연결/);
 assert.match(page,/data-tab="market"/);
 assert.match(page,/aria-label="보유종목 정렬 및 필터"/);
 assert.match(page,/data-market-filter="value"/);
 assert.match(page,/data-market-filter="quantity"/);
 assert.match(page,/id="marketSearch"/);
 assert.match(page,/id="marketRows"/);
 assert.match(page,/id="marketExport"[^>]*disabled/);
 assert.doesNotMatch(page,/579,337\.00|72,957\.00/);
 assert.ok(page.indexOf('id="marketDashboard"')<page.indexOf('id="brokerReadonly"'));
 assert.match(page,/<section id="owner" hidden>/);
});
test('search/sort/export source uses authorized broker snapshot, never market price scraping or live order calls',async()=>{
 const source=await js();
 assert.match(source,/function marketVisibleRows\(/);
 assert.match(source,/function setMarketSnapshot\(/);
 assert.match(source,/function clearMarketRows\(/);
 assert.match(source,/function exportMarketCsv\(/);
 assert.match(source,/marketRequestId/);
 assert.match(source,/if\(requestId!==marketRequestId\|\|el\('owner'\)\.hidden/);
 assert.match(source,/marketRowsData=\[\]/);
 assert.match(source,/marketFilter==='value'/);
 assert.match(source,/marketFilter==='quantity'/);
 assert.match(source,/row\.map\(csvCell\)/);
 assert.doesNotMatch(source,/fetch\(.*k-stock-master/);
 assert.match(source,//broker/snapshot\?broker=/);
 assert.match(source,/el\('marketExport'\)\.disabled=!rows\.length/);
});
test('responsive layout confines table scrolling without altering shared shell',async()=>{
 const stylesheet=await css();
 assert.match(stylesheet,/\.market-dashboard\{max-width:1200px/);
 assert.match(stylesheet,/\.market-indices\{display:grid/);
 assert.match(stylesheet,/\.market-table\{min-width:610px/);
 assert.match(stylesheet,/@media\(max-width:700px\).*\.market-indices\{grid-template-columns:1fr\}/s);
 const page=await html();
 assert.match(page,/class="scroll market-table-wrap"/);
 assert.match(page,/id="stepUpButton"/);
 assert.match(page,/id="liveTrading"/);
 assert.match(page,/id="brokerReadonly"/);
});
