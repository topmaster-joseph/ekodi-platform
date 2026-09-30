import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell=await readFile(new URL('../shell/shell.js',import.meta.url),'utf8');
const css=await readFile(new URL('../shell/user-ui-shell.css',import.meta.url),'utf8');
const policy=JSON.parse(await readFile(new URL('../config/user-ui-shell.json',import.meta.url),'utf8'));

test('public service homes progressively disclose secondary sections',()=>{
  assert.equal(policy.principles.progressiveHomeDisclosure,true);
  assert.match(shell,/function applyProgressiveHomeFocus/);
  assert.match(shell,/surface!==['"]public['"]/);
  assert.match(shell,/['"]church['"],['"]ekodi['"]/);
  assert.match(shell,/candidates\.slice\(2\)/);
  assert.match(shell,/ekodiProgressiveHidden/);
  assert.match(shell,/ekodiProgressiveReveal/);
  assert.match(css,/Progressive home focus v1/);
  assert.match(css,/data-ekodi-progressive-reveal/);
});
