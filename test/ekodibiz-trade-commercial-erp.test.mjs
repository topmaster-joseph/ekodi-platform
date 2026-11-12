import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL(`../${p}`,import.meta.url),'utf8');

test('EKODIBIZ trade ERP extends the existing canonical platform route',async()=>{
  const [admin,api,sql]=await Promise.all([read('workspace-trade-admin-page.js'),read('supabase/functions/workspace-api/index.ts'),read('supabase/migrations/20261112090000_trade_commercial_erp.sql')]);
  assert.ok(admin.includes("['buyers','바이어']"));
  assert.ok(admin.includes("['quotations','견적·원가']"));
  assert.ok(admin.includes("['contracts','계약']"));
  assert.ok(admin.includes("['reports','보고서']"));
  assert.ok(admin.includes("const base=`/${workspaceUrlSlug}/trade/admin`"));
  assert.ok(!admin.includes('topmaster-joseph.chatgpt.site'));
  for(const endpoint of ['/trade/commercial','/trade/buyers','/trade/quotations','/trade/contracts'])assert.ok(api.includes(endpoint),endpoint);
  for(const table of ['trade_buyers','trade_quotations','trade_contracts'])assert.ok(sql.includes(`public.${table}`),table);
});

test('trade quotation keeps the complete landed cost and profit model',async()=>{
  const [admin,sql]=await Promise.all([read('workspace-trade-admin-page.js'),read('supabase/migrations/20261112090000_trade_commercial_erp.sql')]);
  for(const field of ['purchase_cost','shipping_cost','inspection_cost','packing_cost','insurance_cost','other_cost'])assert.ok(sql.includes(field),field);
  for(const label of ['구매원가','운송','검수','포장','보험','총원가','마진'])assert.ok(admin.includes(label),label);
  assert.ok(admin.includes('Print / Save PDF'));
  assert.ok(admin.includes('EKODI Global Trading · Quotation'));
});

test('commercial operations inherit existing trade authority and audit every mutation',async()=>{
  const sql=await read('supabase/migrations/20261112090000_trade_commercial_erp.sql');
  assert.ok(sql.includes('public.trade_current_access'));
  assert.ok(sql.includes("v_access->>'can_write'"));
  assert.ok(sql.includes('public.trade_access_audit_log'));
  assert.ok(sql.includes('enable row level security'));
  assert.ok(sql.includes('revoke all on table public.trade_buyers'));
});
