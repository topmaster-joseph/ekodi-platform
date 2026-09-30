import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css=await readFile(new URL('../community/community-discovery.css',import.meta.url),'utf8');

test('Community keeps the locale label visible on mobile',()=>{
  assert.match(css,/\.language-menu summary\{width:46px/);
  assert.match(css,/\.language-menu summary b\{display:inline/);
  assert.doesNotMatch(css,/\.language-menu summary b\{display:none\}/);
});