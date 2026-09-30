import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../marketing-admin-control.js', import.meta.url), 'utf8');
const publications = readFileSync(new URL('../marketing-admin-publications.js', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8');

test('Marketing admin overview is admin-authenticated and read-only', () => {
  assert.match(source, /adminSession\(request, env\)/);
  assert.match(source, /EKODI 관리자 인증이 필요합니다/);
  assert.match(source, /request\.method === 'GET'/);
  assert.doesNotMatch(source, /request\.method === 'POST'/);
  assert.match(source, /readOnly:true/);
  assert.match(source, /customerPiiIncluded:false/);
  assert.match(source, /customerKeysIncluded:false/);
  assert.match(source, /publicationCredentialsIncluded:false/);
  assert.match(source, /externalExecution:false/);
  assert.match(source, /approvalDecisionEndpointExposedHere:false/);
});

test('Marketing admin overview exposes aggregate operational sources without billing or customer secrets', () => {
  assert.match(source, /service_subscriptions/);
  assert.match(source, /billing_charge_events/);
  assert.match(source, /marketing_store_workspaces/);
  assert.match(source, /marketing_workspace_templates/);
  assert.match(source, /marketing_campaigns/);
  assert.match(source, /marketing_events/);
  assert.match(source, /ai_agent_actions/);
  assert.match(source, /social_registry_config/);
  assert.match(source, /dataContracts/);
  for (const contract of ['campaigns','crm','channels','automation','approvals']) {
    assert.match(source, new RegExp(`${contract}:'connected'`));
  }
  assert.match(source, /publications:publicationLedger\.connected \? 'connected' : 'unavailable'/);
  assert.doesNotMatch(source, /identity_salt/);
  assert.doesNotMatch(source, /payload_json/);
  assert.doesNotMatch(source, /billing_key_cipher/);
  assert.doesNotMatch(source, /billing_key_iv/);
  assert.doesNotMatch(source, /provider_payment_key/);
});

test('Marketing admin reads the authoritative publication queue without credentials or raw personal subject keys', () => {
  assert.match(source, /readMarketingPublicationOverview/);
  assert.match(source, /publicationJobs:publicationLedger\.jobs/);
  assert.match(source, /postingEngine/);
  assert.match(source, /adapterCoverage:\['webhook','facebook_page','instagram_business'\]/);
  assert.match(publications, /marketing_publication_jobs/);
  assert.match(publications, /marketing_content_items/);
  assert.match(publications, /marketing_publish_channels/);
  assert.match(publications, /external_post_url/);
  assert.match(publications, /published_at/);
  assert.match(publications, /subjectLabel/);
  assert.match(publications, /개인 브랜드/);
  assert.doesNotMatch(publications, /credential_ref/);
  assert.doesNotMatch(publications, /external_account_id/);
});

test('Marketing CRM is aggregated without returning pseudonymous customer keys', () => {
  assert.match(source, /crmAggregate/);
  assert.match(source, /customers:customers\.size/);
  assert.match(source, /segments/);
  assert.match(source, /customerKeysIncluded:false/);
  assert.doesNotMatch(source, /customerKey:/);
});

test('Marketing admin includes EKODIBIZ as the internal tenant workspace beside external stores', () => {
  assert.match(source, /publicInternalWorkspace/);
  assert.match(source, /workspaceType:'tenant'/);
  assert.match(source, /workspace_key === 'ekodibiz'/);
  assert.match(source, /canonicalDomain:'marketing\.ekodi\.kr'/);
  assert.match(source, /internal:true/);
});

test('Marketing admin narrows shared AI actions to Marketing-related scope', () => {
  assert.match(source, /MARKETING_ACTION_RE/);
  assert.match(source, /MARKETING_TARGET_RE/);
  assert.match(source, /filter\(isMarketingAction\)/);
  assert.match(source, /status === 'awaiting_human'/);
  assert.match(source, /사람의 결정 대기/);
});

test('Mission control entry routes Marketing admin and ledger before shared customer entry', () => {
  assert.match(entry, /handleMarketingAdminControl/);
  assert.match(entry, /handleMarketingLedgerControl/);
  assert.match(entry, /path\.startsWith\('\/api\/marketing\/admin\/'\)/);
  assert.match(entry, /path\.startsWith\('\/api\/marketing\/ledger\/'\)/);
  assert.ok(entry.indexOf("path.startsWith('/api/marketing/admin/')") < entry.indexOf('customerEntryWorker.fetch'));
  assert.ok(entry.indexOf("path.startsWith('/api/marketing/ledger/')") < entry.indexOf('customerEntryWorker.fetch'));
});
