import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const legacyHost = ['auth','ekodi','kr'].join('.');
const canonical = 'ekodi.kr/auth';

test('EKODI operational UI inventories link to canonical auth, not a browser auth subdomain',()=>{
  for (const file of ['ai-ops-admin.js','admin-lazy-features.js','campus-actions.js']){
    const source=read(file);
    assert.match(source,/domain\s*:\s*['"]ekodi\.kr\/auth['"]/);
    assert.ok(!source.includes("domain:'"+legacyHost+"'"),file);
    assert.ok(!source.includes("domain: '"+legacyHost+"'"),file);
  }
});

test('existing legacy-host monitoring remains linked to the canonical auth control row',()=>{
  const ai=read('ai-ops-admin.js');
  const lazy=read('admin-lazy-features.js');
  const campus=read('campus-actions.js');
  const cockpit=read('mission-control-admin.js');
  assert.match(ai,/agent\.domain === 'ekodi\.kr\/auth' \? map\.get\(\['auth','ekodi','kr'\]\.join\('\.'\)\)/);
  assert.match(lazy,/site\.domain === 'ekodi\.kr\/auth'/);
  assert.match(lazy,/\['auth','ekodi','kr'\]\.join\('\.'\)/);
  assert.match(campus,/id === 'auth' \|\| legacyDomain === \['auth','ekodi','kr'\]\.join\('\.'\)/);
  assert.match(cockpit,/CORE_CANONICAL_DOMAINS = new Set\(\['ekodi\.kr\/admin','ekodi\.kr\/auth'/);
  assert.match(cockpit,/CORE_CANONICAL_DOMAINS\.has\(domain\)\|\|CORE_DOMAINS\.has\(domain\)/);
  assert.ok(cockpit.includes("CORE_DOMAINS = new Set("),'legacy observer retained during C3 transition');
});

test('canonical path display links are resolved by existing admin surface helper',()=>{
  const source=read('admin-surface-labels.js');
  assert.match(source,/new URL\(\/\^https\?:/);
  assert.match(source,/return Object\.freeze\(\{\s*host,\s*label: explicitLabel \|\| raw/);
  assert.match(source,/url: explicitUrl \|\| \(\/\^https\?:/);
});
