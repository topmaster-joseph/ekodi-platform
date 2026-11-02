import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const extended=await readFile(new URL('../church-i18n-extended.js',import.meta.url),'utf8');
const focus=[
  '말씀으로 오늘 읽기',
  '말씀이 오늘의 삶을 해석하게 합니다.',
  '묵상 · 해석 · 한 걸음',
  '지금 연결하기',
  '예배와 교제는 일상 속에서 계속됩니다.',
  '실시간 소통과 온라인 예배 →'
];

test('extended locales explicitly translate every hero focus string',()=>{
  for(const text of focus)assert.ok(extended.includes(`add('${text}'`),`missing extended hero focus translation: ${text}`);
});