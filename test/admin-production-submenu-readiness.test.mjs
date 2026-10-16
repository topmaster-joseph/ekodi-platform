import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const e2e = readFileSync(new URL('../scripts/verify-admin-production-ui-e2e.mjs', import.meta.url),'utf8');
const getResolver = () => e2e.slice(
  e2e.indexOf('async function resolveMenuTrigger(id, group)'),
  e2e.indexOf('const results = [];', e2e.indexOf('async function resolveMenuTrigger(id, group)'))
);

test('Admin E2E retries only its requested submenu after delayed lazy mounting',()=>{
  const resolver=getResolver();
  assert.ok(resolver.startsWith('async function resolveMenuTrigger(id, group)'));
  assert.match(resolver,/attempt < 3/);
  assert.match(resolver,/data-admin-global-group/);
  assert.match(resolver,/data-admin-detail-more/);
  assert.match(resolver,/data-admin-more-group/);
  assert.match(resolver,/if \(!expanded\) await dispatchClick\(more/);
  assert.match(resolver,/await detail\.waitFor\(\{ state: 'visible'/);
  assert.match(resolver,/await dispatchClick\(groupButton/);
});

test('missing submenu still fails visibly with bounded retries and diagnostic evidence',()=>{
  const resolver=getResolver();
  assert.match(resolver,/attempt < 2/);
  assert.match(resolver,/activeGroups:/);
  assert.match(resolver,/focusedGroup:/);
  assert.match(resolver,/no visible left-navigation trigger after selecting work area/);
  assert.doesNotMatch(resolver,/return (?:true|null|undefined);/);
  assert.doesNotMatch(resolver,/route\.fulfill|status:\s*200|authenticated:\s*true/);
});

test('UI-only synthetic Admin verifier does not mutate real production authentication',()=>{
  assert.match(e2e,/SYNTHETIC_TOKEN = 'ekodi-production-ui-e2e'/);
  assert.match(e2e,/page\.route\('https:\/\/ekodi\.kr\/api\/session'/);
  assert.match(e2e,/if \(!response \|\| response\.status\(\) !== 200\)/);
  assert.match(e2e,/if \(activeCount !== expectedCount\) throw new Error/);
});
