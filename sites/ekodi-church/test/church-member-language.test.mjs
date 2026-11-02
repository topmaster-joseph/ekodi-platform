import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const runtime=await readFile(new URL('../my/language.js',import.meta.url),'utf8');
const css=await readFile(new URL('../my/styles.css',import.meta.url),'utf8');

test('member page language control is a local rounded select only',()=>{
  assert.match(runtime,/querySelector\('\[data-ekodi-header-actions\]'\)/);
  assert.match(runtime,/dataset\.ekodiLanguageControl='member-v1'/);
  assert.match(runtime,/className='ekodi-user-language__select'/);
  assert.doesNotMatch(runtime,/My EKODI|https:\/\/ekodi\.kr\/my/);
  assert.match(css,/border-radius:999px/);
  assert.doesNotMatch(runtime,/ekodi-user-language__icon|ekodi-user-language__label/);
});

test('member language control exposes all nine church locales and translates auth copy',()=>{
  for(const locale of ['ko-KR','en','zh-CN','ja','my','kac','vi','mn','id'])assert.match(runtime,new RegExp(`['"]${locale.replace('-','\\-')}['"]`));
  assert.match(runtime,/'\{email\} 계정으로 연결되어 있습니다\.'/);
  assert.match(runtime,/ekodi:church-member-locale-change/);
});
