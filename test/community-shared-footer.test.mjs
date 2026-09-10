import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Community uses one shared footer and shared footer understands modern sRGB colors',async()=>{
  const [page,footer]=await Promise.all([read('community/index.html'),read('shell/user-ui-footer.js')]);
  assert.doesNotMatch(page,/<footer><div class="brand footer-brand"/);
  assert.match(footer,/color\\\(\\s\*srgb/);
  assert.match(footer,/value\*255/);
  assert.match(footer,/dark-on-light/);
});