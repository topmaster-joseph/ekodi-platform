import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [migration,worker,entry,tenantUi,workspace,church,churchApi,monitor,build,site]=await Promise.all([
  read('migrations/0108_finance_banking_tenant_admin.sql'),
  read('finance-banking-worker.js'),
  read('finance-entry-worker.js'),
  read('tenant-finance-admin.js'),
  read('workspace-admin-page.js'),
  read('church-pastor-admin-page.js'),
  read('supabase/functions/church-pastor-api/index.ts'),
  read('finance-monitor.js'),
  read('scripts/build.mjs'),
  read('site-worker.js'),
]);

test('banking schema is additive, tenant-scoped and excludes raw banking credentials',()=>{
  for(const table of ['finance_workspace_organization_links','finance_bank_connections','finance_bank_transactions','finance_transfer_requests','finance_transfer_approvals','finance_bank_audit_log'])
    assert.ok(migration.includes(table),table);
  assert.match(migration,/EKODIMISSION/);
  assert.match(migration,/account_last4/);
  assert.doesNotMatch(migration,/recipient_account_number|source_account_number|internet_banking_password|bank_password|certificate_private_key/i);
});

test('finance entry namespaces and routes the banking control plane',()=>{
  for(const token of ['finance_workspace_organization_links','finance_bank_connections','finance_bank_transactions','finance_transfer_requests','finance_transfer_approvals','finance_bank_audit_log'])
    assert.ok(entry.includes(token),token);
  assert.match(entry,/pathname\.startsWith\('\/api\/finance\/banking'\)/);
  assert.match(entry,/bankingWorker\.fetch/);
});

test('banking API fixes tenant scope server-side and fails closed for real transfers',()=>{
  assert.match(worker,/organizationForWorkspace/);
  assert.match(worker,/current_site_activity_contexts/);
  assert.match(worker,/scope=finance-access|scope','finance-access/);
  assert.match(worker,/SELF_APPROVAL_NOT_ALLOWED/);
  assert.match(worker,/BANKING_EXECUTOR_NOT_CONNECTED/);
  assert.match(worker,/BANKING_TRANSFER_ENABLED/);
  assert.match(worker,/RECIPIENT_ACCOUNT_NUMBER_REQUIRED_AT_EXECUTION/);
  assert.match(worker,/bank_audit_log/);
  assert.doesNotMatch(worker,/recipient_account_number\s*[),]/i);
});

test('tenant and church admin surfaces expose scoped banking without duplicating credentials',()=>{
  assert.match(workspace,/function financeAdmin/);
  assert.match(workspace,/tenant-finance-admin\.js/);
  assert.match(workspace,/if\(section==='finance'\)return financeAdmin\(\)/);
  assert.match(church,/banking:\['통장 · 이체'/);
  assert.match(church,/\['banking','통장 · 이체'\]/);
  assert.match(church,/if\(section==='banking'\)return banking\(\)/);
  assert.match(church,/POLICY\.capabilities\.financeManage/);
  assert.match(churchApi,/FINANCE_ACCESS_ROLES/);
  assert.match(churchApi,/scope'\)==='finance-access'/);
  assert.match(churchApi,/church_treasurer/);
  assert.match(churchApi,/church_finance/);
  assert.match(tenantUi,/수취계좌 전체번호는 요청 단계에서 저장하지 않습니다/);
  assert.match(tenantUi,/recipientAccountNumber/);
});

test('superadmin and shared-site delivery include banking control and asset publication',()=>{
  assert.match(monitor,/financeBankingPanel/);
  assert.match(monitor,/\/api\/finance\/banking\/overview/);
  assert.match(monitor,/계좌 연결 메타데이터 등록/);
  assert.match(monitor,/실제 이체/);
  assert.match(build,/tenant-finance-admin\.js/);
  assert.match(site,/tenant-finance-admin\.js/);
});
