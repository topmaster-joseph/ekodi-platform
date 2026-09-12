import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { platformMaturityProjection } from '../platform-maturity-control.js';

const read = path => fs.readFileSync(path, 'utf8');
const json = path => JSON.parse(read(path));

test('platform maturity dashboard uses protected Control API and super-admin gate', () => {
  const source = read('platform-maturity-admin.js');
  assert.match(source, /api\.ekodi\.kr\/api\/control\/platform-maturity/);
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

test('maturity dashboard registry entry stays in system platform category', () => {
  const registry = read('admin-menu-registry.js');
  assert.match(registry, /id: 'maturity'.*group: 'system'/s);
  assert.match(registry, /maturity:'platform'/);
  assert.match(registry, /platform-maturity-admin\.js/);
});
