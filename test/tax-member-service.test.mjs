import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../'+path, import.meta.url), 'utf8');

test('tax membership policy is enforced across the tax surface', async () => {
  const policy=JSON.parse(await read('config/tax-membership-policy.json'));
  assert.equal(policy.policyId,'EKODIBIZ-TAX-MEMBERSHIP-001');
  assert.equal(policy.status,'enforced');
  assert.equal(policy.scope.canonicalPath,'/tax');
  assert.equal(policy.scope.adminPath,'/tax/admin');
  assert.equal(policy.scope.inheritance,'all_tax_subpages_and_subservices');
  assert.equal(policy.guest.mode,'public_introduction');
  assert.equal(policy.free.businesses,1);
  assert.equal(policy.free.monthlyInvoiceDrafts,5);
  assert.equal(policy.free.manualHometaxIssue,true);
  assert.equal(policy.free.automation,false);
  assert.equal(policy.paid.automaticPaidUpgrade,false);
  assert.equal(policy.paid.priceCatalogRequiredBeforeCheckout,true);
  assert.equal(policy.conversion.darkPatternsForbidden,true);
});

test('member tax data is isolated by authenticated owner, never shared EKODIBIZ org state', async () => {
  const source=await read('tax-member-service.js');
  assert.match(source,/owner_user_id/);
  assert.match(source,/\/auth\/v1\/user/);
  assert.match(source,/site='tax'/);
  assert.match(source,/FREE_MONTHLY_DRAFTS=5/);
  assert.match(source,/FREE_CUSTOMERS=50/);
  assert.match(source,/TAX_FREE_MONTHLY_DRAFT_LIMIT/);
  assert.match(source,/TAX_AUTOMATION_PAID_REQUIRED/);
  assert.doesNotMatch(source,/organizationId:\s*'EKODIBIZ'/);
});

test('finance namespace routes member tax API before legacy tax service', async () => {
  const source=await read('finance-entry-worker.js');
  const member=source.indexOf("pathname.startsWith('/api/finance/tax-member/')");
  const legacy=source.indexOf("pathname.startsWith('/api/finance/tax-')");
  assert.ok(member>=0 && legacy>member);
  assert.match(source,/tax_member_businesses: 'finance_tax_member_businesses'/);
  assert.match(source,/tax_member_customers: 'finance_tax_member_customers'/);
  assert.match(source,/tax_member_invoices: 'finance_tax_member_invoices'/);
});

test('member tax migration is additive and owner scoped', async () => {
  const sql=await read('migrations/0101_tax_member_workspace.sql');
  assert.match(sql,/CREATE TABLE IF NOT EXISTS finance_tax_member_businesses/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS finance_tax_member_customers/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS finance_tax_member_invoices/);
  assert.match(sql,/owner_user_id TEXT NOT NULL/g);
  assert.doesNotMatch(sql,/DROP TABLE|DROP COLUMN/i);
});

test('tax is a universal user service but stays unverified until production verification', async () => {
  const registry=JSON.parse(await read('config/ecosystem-services.json'));
  const tax=registry.services.find(item=>item.id==='tax');
  assert.ok(tax);
  assert.equal(tax.url,'https://ekodi.kr/tax');
  assert.equal(tax.productionVerified,false);
  assert.equal(tax.status,'beta');
});

test('tax portal keeps guest introduction, member workspace and separate admin entry', async () => {
  const source=await read('tax-portal-worker.js');
  assert.match(source,/id="guestLanding"/);
  assert.match(source,/로그인하면 내 사업자 세금업무가 열립니다/);
  assert.match(source,/\/api\/finance\/tax-member\/readiness/);
  assert.match(source,/MODE==='admin'\?'admin':'member'/);
  assert.match(source,/url\.pathname==='\/admin'/);
  assert.doesNotMatch(source,/if\(!sessionStorage\.getItem\(TOKEN\)\)\{location\.replace/);
});
