import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../marketing-ledger-control.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0023_marketing_event_ledger.sql', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8');
const security = readFileSync(new URL('../security-edge.js', import.meta.url), 'utf8');
const liveOps = readFileSync(new URL('../marketing-ai-admin-live-ops.js', import.meta.url), 'utf8');

test('Marketing ledger uses real EKODIBIZ and Jadam pilot scopes without synthetic activity', () => {
  assert.match(migration, /marketing_workspace_templates/);
  assert.match(migration, /marketing_campaigns/);
  assert.match(migration, /marketing_events/);
  assert.match(migration, /'tenant','ekodibiz'/);
  assert.match(migration, /4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa/);
  assert.match(migration, /'service_b2b'/);
  assert.match(migration, /'food_b2c'/);
  assert.match(migration, /No synthetic customer or campaign activity is seeded/);
  assert.doesNotMatch(migration, /INSERT(?: OR IGNORE)? INTO marketing_events/i);
  assert.doesNotMatch(migration, /INSERT(?: OR IGNORE)? INTO marketing_campaigns/i);
});

test('Customer identity is pseudonymized with a private per-workspace salt and never returned', () => {
  assert.match(migration, /identity_salt TEXT NOT NULL/);
  assert.match(migration, /randomblob\(32\)/);
  assert.match(source, /sha256\(`\$\{String\(template\.identity_salt/);
  assert.match(source, /rawCustomerIdentityStored:false/);
  assert.match(source, /customerPiiIncluded:false/);
  assert.match(source, /customerKeysExposed:false/);
  assert.doesNotMatch(source, /phone_number|phone TEXT|email TEXT|customer_name|name TEXT NOT NULL DEFAULT ''/i);
  assert.match(source, /metadata_json.*'\{\}'/s);
});

test('Marketing ledger separates store and tenant permissions', () => {
  assert.match(source, /STORE_MANAGER_ROLES/);
  assert.match(source, /TENANT_MANAGER_ROLES/);
  assert.match(source, /workspace_key.*store:/s);
  assert.match(source, /String\(row\?\.tenant \|\| ''\).*workspaceKey/s);
  assert.match(source, /이 점포의 Marketing CRM을 관리할 권한이 없습니다/);
  assert.match(source, /이 조직의 Marketing CRM을 관리할 권한이 없습니다/);
});

test('Campaign review creates a human gate but exposes no external execution endpoint', () => {
  assert.match(source, /campaign_publish/);
  assert.match(source, /decision_tier/);
  assert.match(source, /'human_gate'/);
  assert.match(source, /'awaiting_human'/);
  assert.match(source, /externalExecution:false/);
  assert.match(source, /\/campaigns\/(\\d\+)\/review/);
  assert.doesNotMatch(source, /\/send|\/publish|\/execute|\/approve/);
});

test('Marketing ledger mutations are routed and rate-limited before shared customer routing', () => {
  assert.match(entry, /handleMarketingLedgerControl/);
  assert.match(entry, /\/api\/marketing\/ledger\//);
  assert.ok(entry.indexOf("path.startsWith('/api/marketing/ledger/')") < entry.indexOf('customerEntryWorker.fetch'));
  assert.match(security, /path\.startsWith\('\/api\/marketing\/ledger\/'\)/);
});

test('Admin live ops renders connected Campaign and CRM ledgers', () => {
  assert.match(liveOps, /LIVE_TABS = new Set\(\['campaigns','crm','channels','automation','approvals'\]\)/);
  assert.match(liveOps, /renderCampaigns/);
  assert.match(liveOps, /renderCrm/);
  assert.match(liveOps, /customer_key조차 포함하지 않습니다/);
});
