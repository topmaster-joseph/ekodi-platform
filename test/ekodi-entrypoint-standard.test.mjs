import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('all shared first-page contracts use ekodi.index as a logical role while keeping slash URLs', async () => {
  const policy = JSON.parse(await read('config/ekodi-entrypoints.json'));
  assert.equal(policy.logicalEntry, 'ekodi.index');
  assert.equal(policy.externalDefaultPath, '/');
  assert.equal(policy.principles.logicalNotPhysicalFile, true);
  assert.equal(policy.principles.keepPublicUrlsSimple, true);
  for (const service of Object.values(policy.services)) {
    assert.equal(service.entry, 'ekodi.index');
    assert.equal(service.path, '/');
  }
});

test('admin emergency is independent but preserves a reduced-capability ekodi.index role', async () => {
  const policy = JSON.parse(await read('config/ekodi-entrypoints.json'));
  const admin = policy.services.admin;
  assert.match(admin.primary, /^https:\/\/admin\.ekodi\.kr\/$/);
  assert.match(admin.emergency, /^https:\/\/[^/]+\.workers\.dev\/$/);
  assert.equal(admin.emergencyMode, 'reduced-capability');
  assert.equal(policy.principles.primaryAndEmergencyShareMentalModel, true);
  assert.equal(policy.principles.primaryAndEmergencyMustNotShareCriticalFailureDependencies, true);
});

test('admin logical entry remains the AI Governance Cockpit', async () => {
  const source = await read('mission-control-admin.js');
  for (const label of ['Overview','Decisions','Ecosystem','AI Council','System']) {
    assert.match(source, new RegExp(`label:'${label}'`));
  }
  assert.match(source, /CHIEF AI BRIEF/);
  assert.match(source, /governanceCommandBar/);
});
