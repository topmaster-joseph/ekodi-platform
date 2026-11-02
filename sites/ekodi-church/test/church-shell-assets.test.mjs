import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../church-shell-i18n.js',import.meta.url),'utf8');

test('Church shell assets resolve to canonical /ekodichurch mount, not platform root',()=>{
  assert.match(source,/const scoped=location\.pathname==='\/ekodichurch'\|\|location\.pathname\.startsWith\('\/ekodichurch\/'\)/);
  assert.match(source,/const assetRoot=scoped\?'\/ekodichurch\/':'\/'/);
  assert.match(source,/link\.href=assetRoot\+'church-header-tune\.css'/);
  assert.match(source,/const src=assetRoot\+name/);
  assert.doesNotMatch(source,/link\.href='\/church-header-tune\.css'/);
  assert.doesNotMatch(source,/for\(const src of \['\/church-/);
});

test('already referenced Church relative modules are not dynamically loaded twice',()=>{
  assert.match(source,/\[\.\.\.document\.scripts\]\.some\(node=>node\.src&&new URL\(node\.src,location\.href\)\.pathname===src\)/);
  for(const name of ['church-i18n-extended.js','church-i18n-payment-patch.js','church-header-controls.js','church-footer-number-i18n.js']){
    assert.ok(source.includes("'"+name+"'"),'extension list lost '+name);
  }
});
