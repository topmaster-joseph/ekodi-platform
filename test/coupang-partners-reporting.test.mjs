import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import {
  AFFILIATE_AUTOMATION_DEFAULTS,
  aggregateCoupangProductPerformance,
  summarizeCoupangSubIds,
  syncCoupangPartnerReports,
  syncScheduledCoupangPartnerReports,
  coupangReportingDue,
  coupangReportWindow,
} from '../coupang-partners-automation.js';


class D1Statement {
  constructor(db,sql){this.db=db;this.sql=sql;this.args=[];}
  bind(...args){this.args=args;return this;}
  async run(){return this.db.prepare(this.sql).run(...this.args);}
  async first(){return this.db.prepare(this.sql).get(...this.args)||null;}
  async all(){return {results:this.db.prepare(this.sql).all(...this.args)};}
}
class D1Db {
  constructor(){this.db=new DatabaseSync(':memory:');}
  prepare(sql){return new D1Statement(this.db,sql);}
  async batch(statements){const out=[];for(const statement of statements) out.push(await statement.run());return out;}
  exec(sql){this.db.exec(sql);}
  close(){this.db.close();}
}

test('report window closes on yesterday in KST and stays within seven days', () => {
  const window = coupangReportWindow(new Date('2026-09-07T09:30:00Z'));
  assert.equal(window.syncDate, '2026-09-07');
  assert.equal(window.startIso, '2026-08-31');
  assert.equal(window.endIso, '2026-09-06');
  assert.equal(window.startDate, '20260831');
  assert.equal(window.endDate, '20260906');
  assert.equal(window.kstHour, 18);
});

test('automatic reporting runs only after 16 KST and once per sync date', () => {
  const before = new Date('2026-09-07T05:30:00Z');
  const after = new Date('2026-09-07T07:30:00Z');
  assert.equal(coupangReportingDue(null, before), false);
  assert.equal(coupangReportingDue(null, after), true);
  assert.equal(coupangReportingDue({ sync_date: '2026-09-07', status: 'failed', finished_at: '2026-09-07T07:00:00Z' }, after), false);
  assert.equal(coupangReportingDue({ sync_date: '2026-09-07', status: 'failed', finished_at: '2026-09-07T05:00:00Z' }, after), true);
  assert.equal(coupangReportingDue({ sync_date: '2026-09-06', status: 'success' }, after), true);
});
test('product reporting keeps purchase outcome separate from first-party clicks', () => {
  const products = [{ id: 11, product_id: '111' }, { id: 22, product_id: '222' }];
  const orders = [
    { date: '20260906', productId: 111, orderId: 1, gmv: 12000, commission: 360 },
    { date: '20260906', productId: 222, orderId: 2, gmv: 20000, commission: 600 },
    { date: '20260906', productId: 999, orderId: 3, gmv: 5000, commission: 150 },
  ];
  const cancels = [{ date: '20260907', orderDate: '20260906', productId: 111, orderId: 1, gmv: 12000, commission: 360 }];
  const result = aggregateCoupangProductPerformance(orders, cancels, products);
  assert.equal(result.matchedOrders, 2);
  assert.equal(result.matchedCancels, 1);
  assert.equal(result.unmatchedOrders, 1);
  assert.equal(result.unmatchedCancels, 0);
  assert.deepEqual(result.rows[0], { productRowId:11, metricDate:'2026-09-06', clicks:0, orders:1, cancels:0, gmvKrw:12000, commissionKrw:360 });
  assert.deepEqual(result.rows[1], { productRowId:22, metricDate:'2026-09-06', clicks:0, orders:1, cancels:0, gmvKrw:20000, commissionKrw:600 });
  assert.deepEqual(result.rows[2], { productRowId:11, metricDate:'2026-09-07', clicks:0, orders:0, cancels:1, gmvKrw:-12000, commissionKrw:-360 });
});

test('runtime uses official report resource family and bounded daily pagination', async () => {
  const [automation, entry, control, diagnose] = await Promise.all([
    readFile(new URL('../coupang-partners-automation.js', import.meta.url), 'utf8'),
    readFile(new URL('../customer-entry-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../affiliate-control.js', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/ekodi-mall-subid-diagnose.yml', import.meta.url), 'utf8'),
  ]);
  assert.equal(AFFILIATE_AUTOMATION_DEFAULTS.reportStartKstHour, 16);
  assert.match(automation, /REPORT_BASE_PATH = '.*\/reports'/);
  assert.match(automation, /fetchReportRows\(env,'orders'/);
  assert.match(automation, /fetchReportRows\(env,'cancels'/);
  assert.match(automation, /fetchReportRows\(env,'commission'/);
  assert.match(automation, /REPORT_MAX_PAGES = 5/);
  assert.match(automation, /coupang_partner_api_purchase/);
  assert.match(entry, /syncScheduledCoupangPartnerReports/);
  assert.match(control, /\/reporting\/sync/);
  assert.doesNotMatch(automation, /buyerEmail|recipient|buyerName|receiverName/);
  assert.match(diagnose, /VERIFIED_MALL_SUB_ID: 'ekodimall'/);
  assert.match(diagnose, /printf '%s' \"\$\{VERIFIED_MALL_SUB_ID\}\"/);
});

test('Sub ID discovery never writes account-wide outcomes into Mall performance', async () => {
  const db=new D1Db(); const requested=[]; const originalFetch=globalThis.fetch;
  globalThis.fetch=async (url)=>{ const u=new URL(String(url)); requested.push(u); assert.equal(u.searchParams.has('subId'),false); const d=coupangReportWindow(new Date(),30).endDate; let data=[];
    if(u.pathname.endsWith('/clicks')) data=[{date:d,subId:'blog-main'},{date:d,subId:'ekodi-mall'}];
    if(u.pathname.endsWith('/orders')) data=[{date:d,subId:'ekodi-mall',productId:123,orderId:1,gmv:10000,commission:300},{date:d,subId:'',productId:999,orderId:2,gmv:5000,commission:150}];
    return new Response(JSON.stringify({rCode:'0',rMessage:'',data}),{status:200,headers:{'content-type':'application/json'}}); };
  try { const result=await syncCoupangPartnerReports({DB:db,COUPANG_PARTNERS_ACCESS_KEY:'a',COUPANG_PARTNERS_SECRET_KEY:'b'},{force:true,reason:'test-discovery'});
    assert.equal(result.status,'sub_id_required'); assert.equal(requested.length,2); assert.equal(result.discoveryCandidates.some(x=>x.subId==='ekodi-mall'),true);
    assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM affiliate_product_performance_daily').first()).n),0); assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM affiliate_daily_metrics').first()).n),0);
    const rows=(await db.prepare('SELECT candidate_sub_id,is_default,clicks_rows,orders_rows,cancels_rows,commission_rows FROM affiliate_partner_subid_discovery ORDER BY candidate_sub_id').all()).results; assert.equal(rows.length,3);
  } finally { globalThis.fetch=originalFetch; db.close(); }
});

test('Sub ID summary is aggregate-only and contains no order payload', () => {
  const rows=summarizeCoupangSubIds({orders:[{date:'20260906',subId:'mall',orderId:'secret-order',productName:'Hidden'}],clicks:[{date:'20260906',subId:'mall'}]});
  assert.deepEqual(rows,[{subId:'mall',isDefault:0,clicksRows:1,ordersRows:1,cancelsRows:0,commissionRows:0,firstSeenDate:'2026-09-06',lastSeenDate:'2026-09-06'}]); assert.equal(JSON.stringify(rows).includes('secret-order'),false); assert.equal(JSON.stringify(rows).includes('Hidden'),false);
});

test('report sync sends Sub ID and persists normalized purchase outcomes', async () => {
  const db=new D1Db();
  db.exec(`CREATE TABLE affiliate_storefront_products (id INTEGER PRIMARY KEY AUTOINCREMENT,account_id TEXT NOT NULL,storefront_slug TEXT NOT NULL,product_id TEXT NOT NULL,product_name TEXT NOT NULL,price_krw INTEGER NOT NULL DEFAULT 0,image_url TEXT NOT NULL DEFAULT '',affiliate_url TEXT NOT NULL,source_keyword TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT 'general',provider_rank INTEGER NOT NULL DEFAULT 0,selection_score REAL NOT NULL DEFAULT 0,selection_source TEXT NOT NULL DEFAULT 'rules',is_rocket INTEGER NOT NULL DEFAULT 0,is_free_shipping INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'active',selected_at TEXT NOT NULL,last_seen_at TEXT NOT NULL,UNIQUE(account_id,storefront_slug,product_id));`);
  const now=new Date().toISOString();
  await db.prepare(`INSERT INTO affiliate_storefront_products(account_id,storefront_slug,product_id,product_name,affiliate_url,selected_at,last_seen_at) VALUES(?,?,?,?,?,?,?)`).bind('coupang-ekodibiz','ekodi-mall','1234567','Proof Product','https://link.coupang.com/proof',now,now).run();
  const window=coupangReportWindow(new Date());
  const requested=[]; const originalFetch=globalThis.fetch;
  globalThis.fetch=async (url)=>{
    const u=new URL(String(url)); requested.push(u); assert.equal(u.searchParams.get('subId'),'ekodi-mall');
    const date=window.endDate; let data=[];
    if(u.pathname.endsWith('/orders')) data=[{date,productId:1234567,orderId:1,gmv:10000,commission:300}];
    if(u.pathname.endsWith('/cancels')) data=[{date,productId:1234567,orderId:2,gmv:2000,commission:60}];
    if(u.pathname.endsWith('/commission')) data=[{date,click:7,order:1,cancel:1,gmv:8000,commission:240}];
    return new Response(JSON.stringify({rCode:'0',rMessage:'',data}),{status:200,headers:{'content-type':'application/json'}});
  };
  try {
    const result=await syncCoupangPartnerReports({DB:db,COUPANG_PARTNERS_ACCESS_KEY:'a',COUPANG_PARTNERS_SECRET_KEY:'b',COUPANG_PARTNERS_SUB_ID:'ekodi-mall'},{force:true,reason:'test'});
    assert.equal(result.status,'success'); assert.equal(requested.length,3);
    const perf=await db.prepare(`SELECT orders,cancels,gmv_krw,commission_krw,source FROM affiliate_product_performance_daily`).first();
    assert.deepEqual({orders:Number(perf.orders),cancels:Number(perf.cancels),gmv:Number(perf.gmv_krw),commission:Number(perf.commission_krw),source:perf.source},{orders:1,cancels:1,gmv:8000,commission:240,source:'coupang_partner_api_purchase'});
    const metric=await db.prepare(`SELECT clicks,orders,revenue_krw,source FROM affiliate_daily_metrics`).first();
    assert.deepEqual({clicks:Number(metric.clicks),orders:Number(metric.orders),revenue:Number(metric.revenue_krw),source:metric.source},{clicks:7,orders:1,revenue:240,source:'coupang_partner_api'});
  } finally { globalThis.fetch=originalFetch; db.close(); }
});

test('scheduled reporting consumes a one-time force request', async () => {
  const db=new D1Db();
  db.exec(`CREATE TABLE affiliate_partner_report_control (account_id TEXT PRIMARY KEY,force_requested_at TEXT,force_reason TEXT NOT NULL DEFAULT '',force_consumed_at TEXT,updated_at TEXT NOT NULL);`);
  const requestedAt=new Date().toISOString();
  await db.prepare(`INSERT INTO affiliate_partner_report_control(account_id,force_requested_at,force_reason,force_consumed_at,updated_at) VALUES(?,?,?,?,?)`).bind('coupang-ekodibiz',requestedAt,'verification',null,requestedAt).run();
  const originalFetch=globalThis.fetch; let requests=0;
  globalThis.fetch=async (url)=>{ requests+=1; const u=new URL(String(url)); const date=coupangReportWindow(new Date()).endDate; const data=u.pathname.endsWith('/clicks')?[{date,subId:'ekodi-mall'}]:[{date,subId:'ekodi-mall',productId:123,orderId:1,gmv:10000,commission:300}]; return new Response(JSON.stringify({rCode:'0',rMessage:'',data}),{status:200,headers:{'content-type':'application/json'}}); };
  try {
    const result=await syncScheduledCoupangPartnerReports({DB:db,COUPANG_PARTNERS_ACCESS_KEY:'a',COUPANG_PARTNERS_SECRET_KEY:'b'});
    assert.equal(result.status,'sub_id_required'); assert.equal(requests,2);
    const control=await db.prepare(`SELECT force_consumed_at FROM affiliate_partner_report_control WHERE account_id=?`).bind('coupang-ekodibiz').first();
    assert.ok(control.force_consumed_at);
  } finally { globalThis.fetch=originalFetch; db.close(); }
});
