import test from 'node:test';
import assert from 'node:assert/strict';
import { storeAdminPage, storeAdminScript, storeAdminCss, storeAdminSlug, storeAdminCanAccess } from '../store-admin-engine.js';

test('mobile store console is a routed, orders-scoped store admin section',async()=>{
  assert.equal(storeAdminSlug('/jadam/admin/mobile'),'jadam');
  assert.equal(storeAdminSlug('/pizzamaru/admin/mobile/'),'pizzamaru');
  assert.equal(storeAdminCanAccess('owner','mobile'),storeAdminCanAccess('owner','pos'));
  const html=await storeAdminPage({slug:'jadam',name:'자담치킨 목포대점',mark:'JD',pathname:'/jadam/admin/mobile'}).text();
  assert.match(html,/<body class="store-mobile">/);
  const pos=await storeAdminPage({slug:'jadam',name:'자담치킨 목포대점',mark:'JD',pathname:'/jadam/admin/pos'}).text();
  assert.doesNotMatch(pos,/<body class="store-mobile">/);
  const script=await storeAdminScript().text();
  assert.match(script,/\['pos','POS 통합화면'\],\['mobile','모바일 주문'\]/);
});

test('mobile console reuses the POS order ledger, stays read-only and never fakes QR payment',async()=>{
  const script=await storeAdminScript().text();
  const start=script.indexOf('function mobilePanel(){');const end=script.indexOf('function posRecentOrders(){');
  assert.ok(start>0&&end>start);
  const panel=script.slice(start,end);
  assert.match(panel,/posOrderView\(\)/);
  assert.doesNotMatch(panel,/rpc\(|control\(|workspace\(|method:'(POST|PUT|PATCH|DELETE)'/);
  assert.doesNotMatch(panel,/\/v1\/focus|127\.0\.0\.1/);
  assert.match(panel,/data-pay-qr="pending-merchant"/);
  assert.match(panel,/<button type="button" disabled>가맹 계약 후 사용<\/button>/);
  assert.match(panel,/자담앤마루\(578-11-00815\) 명의/);
  assert.match(panel,/매장 사업자 명의/);
  assert.match(script,/if\(section==='pos'\|\|section==='mobile'\)\{/);
  assert.match(script,/if\(section==='mobile'\)\{state\.mobileRefreshing=false;state\.mobileUpdatedAt=Date\.now\(\);mobilePanel\(\)\}/);
});

test('mobile console CSS hides desktop chrome and keeps large touch targets',async()=>{
  const css=await storeAdminCss().text();
  assert.match(css,/body\.store-mobile \.sidebar/);
  assert.match(css,/\.m-tabs\{position:fixed/);
  assert.match(css,/\.m-tabs button\{[^}]*min-height:54px/);
  assert.match(css,/\.m-top button\{[^}]*min-height:44px/);
});
