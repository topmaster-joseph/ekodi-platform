import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { patchAdminExternalHandoff } from '../scripts/admin-external-handoff-postbuild.mjs';

test('external Admin anchors do not re-enter internal panel routing after native navigation begins', () => {
  const source = "requestedSection=section;window.setTimeout(()=>{if(!activatePanel(section))requestDemand(section);},0);";
  const output = patchAdminExternalHandoff(source);
  assert.match(output, /item\.matches\('a\.nav\[href\]'\)&&!hasPanel\(section\)\)return/);
  assert.equal((output.match(/window\.setTimeout/g) || []).length, 1);
});

test('the production build applies the external handoff postbuild', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts.build, /admin-external-handoff-postbuild\.mjs/);
});

test('guarded deferred-navigation hook still receives the native external handoff patch', async () => {
  const source = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
  const output = patchAdminExternalHandoff(source);
  assert.match(output, /requestedSection=section;if\(item\.matches\('a\.nav\[href\]'\)&&!hasPanel\(section\)\)return;/);
  assert.match(output, /window\.setTimeout\(\(\)=>\{\s*if\(requestedSection!==section\)return;/);
  assert.equal((output.match(/if\(item\.matches\('a\.nav\[href\]'\)&&!hasPanel\(section\)\)return;/g)||[]).length,1);
  assert.throws(() => patchAdminExternalHandoff(output), /Expected one Admin navigation handoff hook, found 0/);
});

test('postbuild fails closed if the Admin navigation handoff is missing or duplicated', () => {
  const legacy = "requestedSection=section;window.setTimeout(()=>{if(!activatePanel(section))requestDemand(section);},0);";
  assert.throws(() => patchAdminExternalHandoff('unrelated script'), /Expected one Admin navigation handoff hook, found 0/);
  assert.throws(() => patchAdminExternalHandoff(legacy+'\n'+legacy), /Expected one Admin navigation handoff hook, found 2/);
});
