import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../church-i18n-extended.js',import.meta.url),'utf8');

test('extended locales translate every hero headline segment',()=>{
  assert.match(source,/add\('말씀으로 삶을 읽고,'/);
  assert.match(source,/add\('함께 살아내고 증언합니다'/);
  assert.match(source,/add\('그리고 자유와 회복을 일상과 관계 안에서 살아내는 희년\.'/);
  assert.match(source,/shani shagu asak hte matut mahkai hta hkrung nga ai Jubilee/);
  assert.match(source,/Үгээр амьдралаа уншиж/);
  assert.match(source,/хамтдаа амьдруулж, гэрчилнэ/);
});
