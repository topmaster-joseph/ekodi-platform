import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  handleAdminConfirmations,
  handleConfirmationPublic,
  handleWorkspaceConfirmations,
} from '../payment-receipt-confirmation-control.js';
import { tenantAdminPolicySnapshot } from '../tenant-admin-policy.js';
import { workspaceAdminScript } from '../workspace-admin-page.js';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('payment and receipt confirmation engine exposes isolated public, workspace and admin handlers',()=>{
  assert.equal(typeof handleConfirmationPublic,'function');
  assert.equal(typeof handleWorkspaceConfirmations,'function');
  assert.equal(typeof handleAdminConfirmations,'function');
  const source=read('payment-receipt-confirmation-control.js');
  assert.match(source,/const WORKSPACE_PREFIX='\/api\/confirmations'/);
  assert.match(source,/const ADMIN_PREFIX='\/api\/control\/confirmations'/);
  assert.match(source,/kind==='payment'\?'PAY':'RCV'/);
  assert.match(source,/transactionId:source\.transaction_id/);
  assert.match(source,/acceptance_token_hash/);
  assert.match(source,/sha256\(token\)/);
  assert.doesNotMatch(source,/acceptance_token\s+TEXT/i);
  assert.match(source,/RECEIPT_CONFIRMATION_REQUIRED/);
  assert.match(source,/세금계산서·현금영수증·급여명세서/);
  assert.match(source,/document_hash/);
  assert.match(source,/verificationUrl/);
});

test('confirmation migration is additive and keeps payment and receipt in one linked ledger',()=>{
  const migration=read('migrations/0102_payment_receipt_confirmations.sql');
  assert.match(migration,/CREATE TABLE IF NOT EXISTS confirmation_records/);
  assert.match(migration,/kind TEXT NOT NULL CHECK \(kind IN \('payment','receipt'\)\)/);
  assert.match(migration,/transaction_id TEXT NOT NULL/);
  assert.match(migration,/document_number TEXT NOT NULL UNIQUE/);
  assert.match(migration,/acceptance_token_hash TEXT/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS confirmation_events/);
  assert.doesNotMatch(migration,/DROP TABLE|DELETE FROM|ALTER TABLE .* DROP/i);
});

test('tenant policy limits confirmation management to accounting and managing roles',()=>{
  const policy=tenantAdminPolicySnapshot();
  assert.equal(policy.capabilities.confirmations,'tenant.confirmations.manage');
  assert.ok(policy.roleCapabilities.accountant.includes(policy.capabilities.confirmations));
  assert.ok(policy.roleCapabilities.manager.includes(policy.capabilities.confirmations));
  assert.equal(policy.roleCapabilities.marketing_manager.includes(policy.capabilities.confirmations),false);
  assert.equal(policy.roleCapabilities.staff.includes(policy.capabilities.confirmations),false);
});

test('central and tenant admin surfaces expose separate payment and receipt workflows',async()=>{
  const registry=read('admin-menu-registry.js');
  const loader=read('admin-demand-loader.js');
  const api=read('api-worker.js');
  const build=read('scripts/build.mjs');
  const sidebar=read('admin-sidebar.js');
  const common=read('common-services-admin.js');
  const routes=read('admin-canonical-routes.js');
  const script=await (await workspaceAdminScript()).text();
  assert.match(registry,/id: 'confirmations'.*group: 'services'.*지급·수령 확인.*internal: true/);
  assert.match(loader,/confirmation-admin\.js/);
  assert.doesNotMatch(sidebar,/services: \[[^\]]*confirmations/);
  assert.match(common,/name:'지급·수령 확인 엔진'.*category:'common'.*manage:'confirmations'/);
  assert.match(routes,/confirmations:'services'/);
  assert.match(api,/handleConfirmationPublic/);
  assert.match(api,/handleWorkspaceConfirmations/);
  assert.match(api,/handleAdminConfirmations/);
  assert.match(build,/confirmation-admin\.css/);
  assert.match(build,/confirmation-admin\.js/);
  assert.match(script,/data-confirmation-kind="payment">지급/);
  assert.match(script,/data-confirmation-kind="receipt">수령/);
  assert.match(script,/data-confirmation-action="counterpart"/);
  assert.match(script,/workspace==='cgma'.*\['confirmations','지급·수령 확인'\]/s);
  assert.match(script,/async function confirmationApi/);
  assert.match(script,/confirmation_pending/);
});
