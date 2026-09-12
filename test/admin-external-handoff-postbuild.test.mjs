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
