import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { USER_SERVICES, USER_SERVICE_IDS } from '../generated/user-services.js';

const policy = JSON.parse(fs.readFileSync(new URL('../config/universal-membership.json', import.meta.url), 'utf8'));
const registry = JSON.parse(fs.readFileSync(new URL('../config/ecosystem-services.json', import.meta.url), 'utf8'));
const runtime = fs.readFileSync(new URL('../universal-membership.js', import.meta.url), 'utf8');
const entry = fs.readFileSync(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8');
const myWorker = fs.readFileSync(new URL('../my-worker.js', import.meta.url), 'utf8');

const registryUserServices = registry.services.filter((service) => service?.userVisible !== false);
const registryIds = registryUserServices.map((service) => service.id);

test('every registry user service inherits universal membership', () => {
  assert.deepEqual(USER_SERVICES.map((service) => service.id), registryIds);
  for (const id of registryIds) assert.equal(USER_SERVICE_IDS.has(id), true, id);
  assert.equal(policy.defaultEntitlement.tier, 'free');
  assert.equal(policy.defaultEntitlement.scope, 'all_registry_user_services');
});

test('internal workspace engines stay registered without becoming user entitlements', () => {
  const hidden = registry.services.filter((service) => service?.userVisible === false);
  assert.ok(hidden.some((service) => service.id === 'space'));
  for (const service of hidden) assert.equal(USER_SERVICE_IDS.has(service.id), false, service.id);
});

test('internal infrastructure cannot become a user entitlement by accident', () => {
  for (const id of policy.excludedInfrastructure) assert.equal(USER_SERVICE_IDS.has(id), false, id);
});

test('paid plans stay service-specific and universal runtime is wired', () => {
  assert.equal(policy.paidPlans.scope, 'service_specific');
  assert.equal(policy.paidPlans.upgradeIndependently, true);
  assert.match(runtime, /one-account-free-everywhere-pay-where-needed/);
  assert.match(runtime, /\/api\/membership\/portfolio/);
  assert.match(entry, /handleUniversalMembership/);
});

test('My EKODI may read the shared membership API without weakening other browser boundaries', () => {
  assert.match(myWorker, /https:\/\/api\.ekodi\.kr/);
  assert.match(myWorker, /universalMembership:true/);
  assert.match(myWorker, /frame-ancestors 'none'/);
});