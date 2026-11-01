import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [migration,worker,entry,tenantUi,workspace,church,churchApi,monitor,build,site]=await Promise.all([
  read('migrations/0112_finance_banking_tenant_admin.sql'),
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
  assert.match(worker,/renzehysxirjilvdxacv\.supabase\.co\/functions\/v1\/church-pastor-api/);
  assert.match(worker,/SELF_APPROVAL_NOT_ALLOWED/);
  assert.match(worker,/BANKING_EXECUTOR_NOT_CONNECTED/);
  assert.match(worker,/BANKING_TRANSFER_ENABLED/);
  assert.match(worker,/RECIPIENT_ACCOUNT_NUMBER_REQUIRED_AT_EXECUTION/);
  assert.match(worker,/bank_audit_log/);
  assert.doesNotMatch(worker,/recipient_account_number\s*[),]/i);
  assert.match(worker,/url\.pathname==='\/api\/finance\/banking\/transactions\/import'/);
  assert.match(worker,/slice\(0,500\)/);
  assert.match(worker,/ON CONFLICT\(bank_connection_id,external_id\)/);
  assert.match(worker,/const tenantManaged=!actor\.platform/);
  assert.match(worker,/tenantManaged\?'MANUAL'/);
  assert.match(worker,/tenantManaged\?'':clean\(input\?\.accountRef/);
  assert.match(worker,/const transferEnabled=tenantManaged\?0/);
  assert.match(worker,/const readEnabled=tenantManaged\?0/);
  assert.match(worker,/organizationId=tenantManaged\?clean\(actor\.organizationId/);
  assert.match(worker,/SELECT balance_after AS balanceAfter,booked_at AS bookedAt/);
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
  assert.match(tenantUi,/bankCsvImportForm/);
  assert.match(tenantUi,/accept=".csv,text\/csv"/);
  assert.match(tenantUi,/\/transactions\/import/);
  assert.match(tenantUi,/csvTransactions/);
  assert.match(tenantUi,/한 번에 최대 500건/);
  assert.match(tenantUi,/ekodi-bank-transactions-template\.csv/);
  assert.match(tenantUi,/표준 CSV 양식 다운로드/);
  assert.match(tenantUi,/금융결제원 승인과 조직별 계좌동의/);
  assert.match(tenantUi,/href=\"\/privacy\"/);
  assert.match(tenantUi,/href=\"\/terms\"/);
  assert.match(tenantUi,/bankManualAccountForm/);
  assert.match(tenantUi,/승인 전 파일연동 계좌 등록/);
  assert.match(tenantUi,/전체 계좌번호 대신 끝 4자리만 저장/);
  assert.match(tenantUi,/파일연동 계좌 등록/);
});

test('superadmin and shared-site delivery include banking control and asset publication',()=>{
  assert.match(monitor,/financeBankingPanel/);
  assert.match(monitor,/\/api\/finance\/banking\/overview/);
  assert.match(monitor,/계좌 연결 메타데이터 등록/);
  assert.match(monitor,/실제 이체/);
  assert.match(build,/tenant-finance-admin\.js/);
  assert.match(site,/tenant-finance-admin\.js/);
});

test('pre-approval ledger: filters, monthly summary, export, import report and reversible account status',()=>{
  assert.match(worker,/function transactionFilters\(actor,params\)/);
  assert.match(worker,/where\.push\('t\.organization_id=\?'\)/);
  assert.match(worker,/url\.pathname==='\/api\/finance\/banking\/transactions\/summary'/);
  assert.match(worker,/url\.pathname==='\/api\/finance\/banking\/transactions\/export'/);
  assert.match(worker,/bank\.transactions\.export/);
  assert.match(worker,/if\(\/\^\[=\+\\-@\\t\\r\]\/\.test\(text\)\)/);
  assert.match(worker,/BANK_CONNECTION_INACTIVE/);
  assert.match(worker,/PROVIDER_CONNECTION_PLATFORM_MANAGED/);
  assert.match(worker,/bank\.connection\.deactivate/);
  assert.match(worker,/return\{imported:created\+duplicates,created,duplicates,skipped,received:rows\.length,errors\}/);
  assert.doesNotMatch(worker,/DELETE FROM bank_connections|DELETE FROM bank_transactions/);
  assert.match(tenantUi,/bankTxnFilterForm/);
  assert.match(tenantUi,/월별 수입 · 지출/);
  assert.match(tenantUi,/CSV 내보내기/);
  assert.match(tenantUi,/response\.blob\(\)/);
  assert.match(tenantUi,/bankAccountEditForm/);
  assert.match(tenantUi,/사용 중지/);
  assert.match(tenantUi,/파일연동 운영/);
  assert.match(tenantUi,/조회 전용 연결/);
  assert.match(tenantUi,/이미 있던 거래/);
  assert.match(workspace,/tenant-finance-admin\.js\?v=20261031-ledger2/);
  assert.match(church,/tenant-finance-admin\.js\?v=20261031-ledger2/);
});
