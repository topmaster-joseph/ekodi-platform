import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('public footer traffic has a CSP-compatible external stylesheet with readable spacing', async () => {
  const [css,script] = await Promise.all([
    read('shell/user-ui-shell.css'),
    read('shell/user-ui-footer.js')
  ]);
  assert.match(css, /\.ekodi-footer-traffic\[data-ekodi-footer-traffic\]\{/);
  assert.match(css, /column-gap:28px!important/);
  assert.match(css, /row-gap:10px!important/);
  assert.match(css, /@media\(max-width:390px\)/);
  assert.match(css, /column-gap:20px!important/);
  assert.match(css, /\.ekodi-footer-traffic__note\{\s*flex-basis:100%!important/);
  assert.match(css, /display:flex!important/);
  assert.match(css, /flex-wrap:wrap!important/);
  assert.match(script, /attachFooterTraffic\(nativeFooter\(\)\)/);
  assert.match(script, /data-ekodi-footer-traffic/);
});
