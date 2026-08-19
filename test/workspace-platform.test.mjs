import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('workspace migration creates isolated Messenger and Investment ledgers',async()=>{
  const sql=await read('migrations/0028_messenger_investment_workspaces.sql');
  for(const table of ['messenger_threads','messenger_messages','messenger_handoffs','investment_opportunities','investment_diligence_items'])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(sql,/subject_type IN \('person','tenant'\)/);
  assert.match(sql,/waiting_human/);
  assert.match(sql,/diligence/);
  assert.doesNotMatch(sql,/custody_balance|brokerage_order|securities_order|guaranteed_return/i);
});

test('workspace API verifies bearer identity and server-side subject access',async()=>{
  const worker=await read('workspace-platform-api-worker.js');
  assert.match(worker,/\/auth\/v1\/user/);
  assert.match(worker,/customer_tenants/);
  assert.match(worker,/customer_access_grants/);
  assert.match(worker,/SUBJECT_TYPES=new Set\(\['person','tenant'\]\)/);
  assert.match(worker,/subjectType==='person'/);
  assert.doesNotMatch(worker,/SUPABASE_SERVICE_ROLE_KEY/);
});

test('Messenger API persists threads, messages and explicit human handoff state',async()=>{
  const worker=await read('workspace-platform-api-worker.js');
  for(const route of ['/v1/messenger/threads','/messages','/handoff'])assert.ok(worker.includes(route.replace('/messages','messages').replace('/handoff','handoff'))||worker.includes(route));
  assert.match(worker,/messenger_threads/);
  assert.match(worker,/messenger_messages/);
  assert.match(worker,/messenger_handoffs/);
  assert.match(worker,/HANDOFF_ALREADY_OPEN/);
  assert.match(worker,/waiting_human/);
});

test('Investment API stays analysis-only while supporting opportunity and diligence workflow',async()=>{
  const worker=await read('workspace-platform-api-worker.js');
  assert.match(worker,/analysis-and-connection-only/);
  assert.match(worker,/transactionExecution:false/);
  assert.match(worker,/investment_opportunities/);
  assert.match(worker,/investment_diligence_items/);
  for(const stage of ['inbox','screening','diligence','memo','watch','declined','connected'])assert.ok(worker.includes(`'${stage}'`));
  assert.doesNotMatch(worker,/executeTrade|placeOrder|custody|guaranteedReturn/);
});

test('staging disables mutations and first production bootstrap is read-only',async()=>{
  const [staging,bootstrap,production]=await Promise.all([
    read('wrangler.workspace-platform-staging.toml'),read('wrangler.workspace-platform-bootstrap.toml'),read('wrangler.workspace-platform.toml')
  ]);
  assert.match(staging,/ALLOW_MUTATIONS = "false"/);
  assert.match(bootstrap,/ALLOW_MUTATIONS = "false"/);
  assert.match(production,/ALLOW_MUTATIONS = "true"/);
  for(const config of [staging,bootstrap,production])assert.match(config,/database_name = "ekodi-auth"/);
});

test('functional platform pages consume central handoff and authenticated workspace API',async()=>{
  const router=await read('platform-router-worker.js');
  assert.match(router,/FUNCTIONAL BETA/);
  assert.match(router,/workspace-api\.ekodi\.kr/);
  assert.match(router,/\/auth\/v1\/verify/);
  assert.match(router,/ekodi_token/);
  assert.match(router,/refresh_token/);
  assert.match(router,/authorization:'Bearer '/);
  assert.match(router,/subject_type/);
  assert.match(router,/subject_key/);
  assert.match(router,/newThreadForm/);
  assert.match(router,/newOpportunityForm/);
  assert.match(router,/diligenceForm/);
});

test('release pipeline applies additive schema before read-only staging and guarded production',async()=>{
  const [workflow,helper]=await Promise.all([
    read('.github/workflows/release-messenger-investment-functional.yml'),
    read('scripts/apply-d1-migrations-with-retry.sh')
  ]);
  assert.match(workflow,/apply-d1-migrations-with-retry\.sh ekodi-auth wrangler\.workspace-platform\.toml/);
  assert.match(helper,/d1 migrations apply/);
  assert.match(helper,/UNIQUE constraint failed: d1_migrations\\\.name|d1_migrations\.name/);
  assert.match(workflow,/wrangler\.workspace-platform-staging\.toml/);
  assert.match(workflow,/wrangler\.workspace-platform-bootstrap\.toml/);
  assert.match(workflow,/guarded-worker-release\.mjs --manifest deploy\/manifests\/workspace-platform\.worker\.json/);
  assert.match(workflow,/guarded-worker-release\.mjs --manifest deploy\/manifests\/shared-site\.worker\.json/);
});
