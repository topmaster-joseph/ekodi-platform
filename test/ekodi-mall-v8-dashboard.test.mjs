import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { mallGrowthDashboardSnapshot } from '../mall-growth-dashboard.js';

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
  exec(sql){this.db.exec(sql);}
  close(){this.db.close();}
}
const read = path => readFile(new URL(`../${path}`, import.meta.url),'utf8');
function dashboardSchema(db){
  db.exec(`
CREATE TABLE affiliate_storefront_products(id INTEGER PRIMARY KEY,product_id TEXT,product_name TEXT,category TEXT,status TEXT);
CREATE TABLE affiliate_product_performance_daily(product_row_id INTEGER,metric_date TEXT,clicks INTEGER,orders INTEGER,cancels INTEGER,gmv_krw INTEGER,commission_krw INTEGER);
CREATE TABLE affiliate_growth_policy_snapshots(run_date TEXT,product_row_id INTEGER,provider TEXT,policy_score REAL,recommended_action TEXT,visits_30d INTEGER,outbound_clicks_30d INTEGER,funnel_rate REAL,orders_30d INTEGER,cancels_30d INTEGER,commission_30d_krw INTEGER,earnings_per_click_krw REAL,expected_commission_per_visit_krw REAL,confidence_score REAL,reason_json TEXT);
CREATE TABLE affiliate_growth_strategy_runs(run_date TEXT,status TEXT,candidates INTEGER,scale_count INTEGER,test_count INTEGER,observe_count INTEGER,hold_count INTEGER,top_opportunity_score REAL,source_status_json TEXT,completed_at TEXT,last_error TEXT);
CREATE TABLE affiliate_promotion_runs(id INTEGER PRIMARY KEY,run_date TEXT,product_row_id INTEGER,provider TEXT,status TEXT,published_at TEXT,updated_at TEXT,external_post_url TEXT,last_error TEXT,content_json TEXT);
CREATE TABLE affiliate_promotion_visits(campaign_key TEXT,visit_date TEXT,visits INTEGER);
CREATE TABLE affiliate_promotion_outbound_clicks(campaign_key TEXT,click_date TEXT,clicks INTEGER);
`);
}

test('Mall V8 dashboard separates observed provider revenue from estimated channel value', async()=>{
  const db=new D1Db(); dashboardSchema(db);
  db.exec(`INSERT INTO affiliate_storefront_products VALUES(1,'p1','테스트 상품','식품','active');
INSERT INTO affiliate_product_performance_daily VALUES(1,date('now'),20,4,1,100000,5000);
INSERT INTO affiliate_growth_strategy_runs VALUES(date('now'),'completed',12,1,2,3,6,91.2,'{"internal":"ok"}',datetime('now'),'');
INSERT INTO affiliate_growth_policy_snapshots VALUES(date('now'),1,'instagram',88.5,'scale',50,20,0.4,4,1,5000,250,100,92,'{"reason":"funnel_value_observed"}');
INSERT INTO affiliate_promotion_runs VALUES(1,date('now','+9 hours'),1,'instagram','published',datetime('now'),datetime('now'),'https://example.test/post','','{"recommendedAction":"scale","policyScore":88.5}');
INSERT INTO affiliate_promotion_visits VALUES('c1',date('now'),50);
INSERT INTO affiliate_promotion_outbound_clicks VALUES('c1',date('now'),20);`);
  const data=await mallGrowthDashboardSnapshot({DB:db});
  assert.equal(data.ok,true);
  assert.equal(data.performance30d.observedCommissionKrw,5000);
  assert.equal(data.performance30d.campaignVisits,50);
  assert.equal(data.performance30d.outboundAffiliateClicks,20);
  assert.equal(data.performance30d.orders,4);
  assert.equal(data.topDecision.action,'scale');
  assert.equal(data.topDecision.expectedCommissionPerVisitKrw,100);
  assert.equal(data.evidence.channelRevenueAttribution,'estimated_not_causal');
  assert.equal(data.evidence.customerPiiStored,false);
  db.close();
});

test('Mall admin dashboard contract is authenticated, canonical and operator-facing', async()=>{
  const [worker,workspace,migration]=await Promise.all([
    read('marketing-growth-worker.js'),read('workspace-admin-page.js'),read('migrations/0073_ekodibiz_marketing_subject_canonical.sql'),
  ]);
  assert.match(worker,/\/v1\/mall\/dashboard/);
  assert.match(worker,/subject\.key !== 'ekodi-biz'/);
  assert.match(workspace,/NEXT BEST ACTION/);
  assert.match(workspace,/관측 수수료 · 30일/);
  assert.match(workspace,/채널별 예상수익은 인과 수익으로 표시하지 않습니다/);
  assert.match(workspace,/if\(section==='analytics'\)return mallAnalytics\(\)/);
  assert.match(migration,/subject_key='ekodi-biz'/);
  assert.match(migration,/WHERE t\.slug='ekodi-biz'/);
});

test('canonical subject migration preserves connected marketing assets while fixing authorization identity', async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`PRAGMA foreign_keys=OFF;
CREATE TABLE customer_tenants(id INTEGER PRIMARY KEY AUTOINCREMENT,slug TEXT UNIQUE,name TEXT,domain TEXT,status TEXT,created_at TEXT);
CREATE TABLE customer_access_grants(tenant_id INTEGER,email TEXT,role TEXT,enabled INTEGER,created_at TEXT,last_verified_at TEXT,UNIQUE(tenant_id,email));
CREATE TABLE ai_agent_actions(id INTEGER PRIMARY KEY);`);
  for(const file of ['migrations/0016_membership_billing.sql','migrations/0018_marketing_store_workspaces.sql','migrations/0023_marketing_event_ledger.sql','migrations/0026_marketing_publication_queue.sql','migrations/0028_marketing_growth_connectors.sql','migrations/0055_channel_automation_core.sql','migrations/0064_marketing_channel_settings.sql']) db.exec(await read(file));
  db.exec(`INSERT INTO customer_tenants(slug,name,domain,status,created_at) VALUES('ekodi-biz','에코디비즈','biz.ekodi.kr','active',datetime('now'));
INSERT INTO service_subscriptions(subject_type,subject_key,site,plan_id,status,monthly_fee,provider,created_at,updated_at) VALUES('tenant','ekodibiz','marketing','auto','active',0,'internal',datetime('now'),datetime('now'));
INSERT INTO marketing_publish_policies(subject_type,subject_key,mode,max_daily_posts,allowed_providers_json,quiet_hours_json,created_at,updated_at) VALUES('tenant','ekodibiz','autonomous',3,'[]','{}',datetime('now'),datetime('now'));
INSERT INTO marketing_oauth_connections(subject_type,subject_key,provider,resource_type,external_id,display_name,token_ciphertext,status,created_at,updated_at) VALUES('tenant','ekodibiz','youtube','channel','c1','Mall','cipher','active',datetime('now'),datetime('now'));
INSERT INTO marketing_publish_channels(subject_type,subject_key,provider,channel_type,display_name,external_account_id,status,created_at,updated_at) VALUES('tenant','ekodibiz','youtube','channel','Mall','c1','active',datetime('now'),datetime('now'));
INSERT INTO channel_automation_profiles(owner_type,owner_key,workspace_slug,template_id,enabled,created_by_email,created_at,updated_at) VALUES('workspace','ekodibiz','ekodibiz','shorts',1,'x@example.test',datetime('now'),datetime('now'));`);
  db.exec(await read('migrations/0073_ekodibiz_marketing_subject_canonical.sql'));
  assert.equal(db.prepare("SELECT subject_key FROM service_subscriptions WHERE subject_key='ekodi-biz' AND site='marketing'").get().subject_key,'ekodi-biz');
  assert.equal(db.prepare("SELECT subject_key FROM marketing_oauth_connections WHERE external_id='c1'").get().subject_key,'ekodi-biz');
  assert.equal(db.prepare("SELECT subject_key FROM marketing_publish_channels WHERE external_account_id='c1'").get().subject_key,'ekodi-biz');
  assert.equal(db.prepare("SELECT owner_key FROM channel_automation_profiles WHERE template_id='shorts'").get().owner_key,'ekodi-biz');
  assert.ok(db.prepare('SELECT count(*) AS n FROM customer_access_grants').get().n>=1);
  db.close();
});

test('Mall product management projects the real public affiliate catalog instead of a placeholder', async()=>{
  const workspace=await read('workspace-admin-page.js');
  assert.match(workspace,/async function mallProducts\(\)/);
  assert.match(workspace,/api\.ekodi\.kr\/api\/affiliate\/public\/products\?storefront=ekodi-mall&limit=100/);
  assert.match(workspace,/실제 공개 상품 카탈로그/);
  assert.match(workspace,/if\(section==='products'\)return mallProducts\(\)/);
  assert.match(workspace,/제휴·소싱 관리/);
});
