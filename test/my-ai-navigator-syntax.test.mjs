import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../my/navigator.js',import.meta.url),'utf8');

test('My EKODI navigator browser script parses without executing DOM code',()=>{
  assert.doesNotThrow(()=>new Function(source));
});