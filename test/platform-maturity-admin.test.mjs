import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const json = path => JSON.parse(read(path));

test('platform maturity dashboard uses governance source of truth and super-admin gate', () => {
  const source = read('platform-maturity-admin.js');
  assert.match(source, /governance\/standards/);
  assert.match(source, /ekodi-current-maturity\.json/);
  assert.match(source, /ekodi-international-maturity-model\.json/);
  assert.match(source, /history\/index\.json/);
  assert.match(source, /session\?\.role !== 'super_admin'/);
  assert.match(source, /certificationStatus === 'not-claimed'/);
  assert.doesNotMatch(source, /certified\s*[:=]\s*true/i);
});

test('maturity history index contains the current assessment snapshot', () => {
  const current = json('governance/standards/ekodi-current-maturity.json');
  const index = json('governance/standards/history/index.json');
  const entry = index.snapshots.find(item => item.date === current.assessmentDate);
  assert.ok(entry, 'current assessment date must be indexed');
  assert.equal(entry.file, `${current.assessmentDate}.json`);
  assert.ok(fs.existsSync(`governance/standards/history/${entry.file}`));
});

test('maturity dashboard registry entry stays in system platform category', () => {
  const registry = read('admin-menu-registry.js');
  assert.match(registry, /id: 'maturity'.*group: 'system'/s);
  assert.match(registry, /maturity:'platform'/);
  assert.match(registry, /platform-maturity-admin\.js/);
});
