import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');

test('every mission public activity detail template is covered by shared URL action',async()=>{
  const shell=await read('space/ekodimission-shell.js');
  for(const css of ['main .sub-hero','main .event-hero','main .open-table-hero','main .event-intro','main > section:first-of-type']){
    assert.ok(shell.includes(css),css);
  }
  assert.match(shell,/hero\.querySelector\('h1'\)/);
  assert.ok(shell.includes("hero.querySelector('[data-share-event], [data-mission-share-button]')"));
  assert.ok(shell.includes("hero.querySelector('.open-table-copy')||hero"));
  for(const file of ['ekodimission-autumn-trip-apply.page','ekodimission-open-table-apply.page']){
    const html=await read('space/'+file);
    assert.ok(html.includes('class="open-table-hero"'),file);
    assert.ok(html.includes('/ekodimission/assets/shell.js'),file);
  }
});
