import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// 2026-10-20: on a dark page theme the operating-space card names (요거트퍼플·자담치킨) inherited
// light text on a white card and became invisible.
const css=await readFile(new URL('../space/style.css',import.meta.url),'utf8');
const html=await readFile(new URL('../space/index.html',import.meta.url),'utf8');

test('white operating-space surfaces own their text color',()=>{
  assert.match(css,/#internalShell :is\(\.panel,\.space-card,\.unmapped-list\)\{color:#18211b\}/);
  assert.match(css,/#internalShell \.space-card strong\{color:#18211b\}/);
});

test('every light-background internal rule either sets color or is covered by the guard',()=>{
  const guarded=new Set(['.panel','.space-card','.unmapped-list']);
  const rules=[...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(m=>({sel:m[1].trim(),body:m[2]}));
  const risky=rules.filter(r=>/background:#fff(?:[0-9a-f]{3})?\b/i.test(r.body)&&!/(^|;)color:/.test(r.body)&&!r.sel.startsWith('.yp-')&&!guarded.has(r.sel.replace(/^@media[^{]*\{/,'').split(':')[0].trim()));
  assert.deepEqual(risky.map(r=>r.sel),[]);
});

test('space stylesheet cache-buster bumped',()=>{
  assert.match(html,/style\.css\?v=20261020-space-card-contrast-2/);
});
