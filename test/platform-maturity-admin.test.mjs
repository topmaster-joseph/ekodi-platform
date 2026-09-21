import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { platformMaturityProjection } from '../platform-maturity-control.js';

const read = path => fs.readFileSync(path, 'utf8');
const json = path => JSON.parse(read(path));

test('platform maturity dashboard uses protected Control API and super-admin gate', () => {
  const source = read('platform-maturity-admin.js');
  assert.match(source, /ekodi\.kr\/api\/control\/platform-maturity/);
  assert.match(source, /authorization.*Bearer/s);
  assert.match(source, /session\?\.role !== 'super_admin'/);
  assert.match(source, /certificationStatus === 'not-claimed'/);
  assert.doesNotMatch(source, /fetch\([^)]*governance\/standards/);
  assert.doesNotMatch(source, /certified\s*[:=]\s*true/i);
});

test('protected maturity projection exposes current evidence and summary-only history', () => {
  const payload = platformMaturityProjection();
  assert.equal(payload.certificationStatus, 'not-claimed');
  assert.equal(payload.current.certificationStatus, 'not-claimed');
  assert.ok(Array.isArray(payload.model.domains) && payload.model.domains.length > 0);
  assert.ok(Array.isArray(payload.history) && payload.history.length > 0);
  assert.ok(payload.serviceScopes?.summary?.totalScopes > 0);
  assert.ok(Array.isArray(payload.serviceScopes?.services) && payload.serviceScopes.services.length > 0);
  assert.ok(Array.isArray(payload.serviceScopes?.workspaceSites) && payload.serviceScopes.workspaceSites.length > 0);
  for (const item of payload.history) {
    assert.deepEqual(Object.keys(item).sort(), ['date', 'overall']);
    assert.ok(Number.isFinite(item.overall));
  }
});
test('maturity history index carries the current score summary and immutable snapshot', () => {
  const current = json('governance/standards/ekodi-current-maturity.json');
  const index = json('governance/standards/history/index.json');
  const model = json('governance/standards/ekodi-international-maturity-model.json');
  const entry = index.snapshots.find(item => item.date === current.assessmentDate);
  assert.ok(entry, 'current assessment date must be indexed');
  assert.equal(entry.file, `${current.assessmentDate}.json`);
  assert.ok(fs.existsSync(`governance/standards/history/${entry.file}`));
  const byId = new Map(current.domains.map(row => [row.id, row]));
  const overall = Number((model.domains.reduce((sum, domain) => sum + Number(byId.get(domain.id)?.score || 0) * Number(domain.weight || 0), 0) / 100).toFixed(2));
  assert.equal(entry.overall, overall);
});

test('Control API exposes maturity only behind explicit super-admin authorization', () => {
  const api = read('api-worker.js');
  assert.match(api, /platformMaturityProjection/);
  assert.match(api, /path === `\$\{CONTROL_PREFIX\}\/platform-maturity`/);
  assert.match(api, /auth\.session\.role !== 'super_admin'/);
  assert.match(api, /PLATFORM_MATURITY_FORBIDDEN/);
});

test('maturity dashboard registry entry stays in the status area', () => {
  const registry = read('admin-menu-registry.js');
  assert.match(registry, /id: 'maturity'[^\n]*group: 'status'/);
  assert.match(registry, /maturity:'status'/);
  assert.match(registry, /platform-maturity-admin\.js/);
});


test('subservice maturity coverage includes every registered service and workspace site without invented local scores', () => {
  const payload = platformMaturityProjection();
  const services = json('config/ecosystem-services.json').services;
  const sites = json('config/site-lifecycle-registry.json').existingWorkspaceSites;
  assert.equal(payload.serviceScopes.summary.services, services.length);
  assert.equal(payload.serviceScopes.summary.workspaceSites, sites.length);
  const capabilities = json('config/capability-registry.json').capabilities;
  assert.equal(payload.serviceScopes.summary.systemFunctions, capabilities.length);
  assert.equal(payload.serviceScopes.summary.totalScopes, services.length + sites.length + capabilities.length);
  assert.equal(payload.serviceScopes.policy.numericScorePolicy, 'no-local-score-without-evidence');
  for (const item of [...payload.serviceScopes.services, ...payload.serviceScopes.workspaceSites, ...payload.serviceScopes.systemFunctions]) {
    assert.equal(item.localAssessmentState, 'not-assessed');
    assert.equal(item.localMaturityScore, null);
  }
});

test('maturity dashboard renders subordinate service and workspace coverage', () => {
  const source = read('platform-maturity-admin.js');
  assert.match(source, /하위서비스·사이트 적용범위/);
  assert.match(source, /dataset\.maturityScope/);
  assert.match(source, /미평가 · 로컬 증빙 필요/);
  assert.match(source, /payload\.serviceScopes/);
  assert.match(source, /시스템 기능/);
});


test('system function maturity coverage mirrors the universal capability registry', () => {
  const payload = platformMaturityProjection();
  const capabilities = json('config/capability-registry.json').capabilities;
  assert.equal(payload.serviceScopes.systemFunctions.length, capabilities.length);
  const expected = new Set(capabilities.map(item => item.id));
  for (const item of payload.serviceScopes.systemFunctions) {
    assert.ok(expected.has(item.id));
    assert.equal(item.scopeType, 'system-function');
    assert.equal(item.localMaturityScore, null);
    assert.equal(item.localAssessmentState, 'not-assessed');
  }
});
