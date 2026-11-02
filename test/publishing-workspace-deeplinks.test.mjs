import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('publishing workspace reacts to header and hero deep links without a reload', () => {
  const script = read('publishing/workspace.js');
  assert.match(script, /window\.addEventListener\('hashchange',/);
  assert.match(script, /const id = tabFromHash\(\)/);
  assert.match(script, /if \(!id\) return;[^\n]*Other anchors/);
  assert.match(script, /show\(id\);/);
  assert.match(script, /root\.scrollIntoView\(\{ block: 'start' \}\)/);
  assert.match(script, /#ws-\(mine\|write\|progress\|editions\|channels\|royalty\|support\)/);
});

test('menu links target real workspace tabs without exposing nonpublic manuscript data', () => {
  const home = read('publishing/index.html');
  for (const key of ['mine', 'progress']) {
    assert.match(home, new RegExp('href="https://ekodi\\.kr/publishing/#ws-' + key + '"'));
    assert.match(home, new RegExp('role="tabpanel" id="ws-' + key + '"'));
  }
  const source = read('publishing/workspace.js');
  assert.match(source, /authorization: `Bearer \$\{t\}`/);
  assert.match(source, /getJson\(`\$\{WORKFLOW\}\/projects`/);
});
