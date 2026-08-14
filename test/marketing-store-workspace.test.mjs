import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeWorkspaceSlug } from '../marketing-store-workspace.js';
import { normalizeStoreCustomerHostname } from '../marketing-store-domain.js';

const [billing, migration, worker, workspaceControl, domainControl] = await Promise.all([
  readFile(new URL('../membership-billing.js', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/0018_marketing_store_workspaces.sql', import.meta.url), 'utf8'),
  readFile(new URL('../marketing-domain-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../marketing-store-workspace.js', import.meta.url), 'utf8'),
  readFile(new URL('../marketing-store-domain.js', import.meta.url), 'utf8'),
]);

test('store subject is verified through Supabase workspace identity before billing', () => {
  assert.match(billing, /subject_type.*store/s);
  assert.match(billing, /current_site_workspaces/);
  assert.match(billing, /workspace_key.*store:/s);
  assert.match(billing, /STORE_PLAN_MANAGERS/);
  assert.match(billing, /body\?\.store/);
  assert.match(billing, /row\.subject_type === 'store'/);
});

test('association Basic remains the floor while paid plans belong to the store subject', () => {
  assert.match(billing, /basePlan === 'basic'/);
  assert.match(billing, /plan_id='basic',status='active'/);
  assert.match(billing, /subject\.type === 'store'.*site === 'marketing'/s);
  assert.match(billing, /UNIQUE\(subject_type, subject_key, site\)/);
});

test('Plus canonical workspace uses the shared Marketing AI Pages project', () => {
  assert.equal(normalizeWorkspaceSlug('My Store 01'), 'my-store-01');
  assert.equal(normalizeWorkspaceSlug('marketing'), '');
  assert.match(workspaceControl, /PLUS_OR_ABOVE/);
  assert.match(workspaceControl, /\.ai\.ekodi\.kr/);
  assert.match(workspaceControl, /provider_project.*marketing-ai/s);
  assert.match(workspaceControl, /subject_type='store'/);
  assert.match(worker, /handleMarketingStoreWorkspaceRequest/);
});

test('Pro store custom domains reject EKODI and provider-owned suffixes', () => {
  assert.equal(normalizeStoreCustomerHostname('ai.example.com'), 'ai.example.com');
  assert.equal(normalizeStoreCustomerHostname('shop.ekodi.kr'), '');
  assert.equal(normalizeStoreCustomerHostname('foo.pages.dev'), '');
  assert.match(domainControl, /PRO_OR_ABOVE/);
  assert.match(domainControl, /store-domains/);
  assert.match(worker, /handleMarketingStoreDomainRequest/);
});

test('D1 migration permits store subjects without weakening subject uniqueness', () => {
  assert.match(migration, /subject_type IN \('person','tenant','store'\)/);
  assert.match(migration, /UNIQUE\(subject_type, subject_key\)/);
  assert.match(migration, /FOREIGN KEY\(workspace_id\) REFERENCES marketing_workspaces_v2\(id\)/);
});
