import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const core=await readFile(new URL('../church-i18n.js',import.meta.url),'utf8');
const extended=await readFile(new URL('../church-i18n-extended.js',import.meta.url),'utf8');
const shell=await readFile(new URL('../church-shell-i18n.js',import.meta.url),'utf8');
const header=await readFile(new URL('../church-header-controls.js',import.meta.url),'utf8');

test('core church i18n honors supported ?lang= values and delegates extended locales',()=>{
  assert.match(core,/new URLSearchParams\(location\.search\)\.get\('lang'\)/);
  assert.match(core,/DELEGATED_URL_LOCALES/);
  assert.match(core,/if\(delegatedUrlLocale\(\)\)return;applyDocument/);
  assert.match(core,/requested&&SUPPORTED\.has\(requested\)/);
  assert.match(core,/세상에서 구별된 에클레시아, 하나님과 하나된 코이노니아, 세상 속에 증인된 디아스포라/);
});

test('extended church i18n owns extended ?lang= values during initial render',()=>{
  assert.match(extended,/new URLSearchParams\(location\.search\)\.get\('lang'\)/);
  assert.match(extended,/if\(NEW\.has\(requested\)\)return requested/);
  assert.match(extended,/if\(NEW\.has\(shared\)\)desired=shared;apply\(desired\)/);
  assert.match(extended,/add\('전체 소셜채널 ↗'/);
});

test('language selector is created synchronously before async shell scheduling',()=>{
  assert.match(shell,/ensureLanguageControl\(\);\r?\nwindow\.addEventListener\('ekodi:locale-change'/);
});


test('header focus honors explicit ?lang= before persisted user locale',()=>{
  assert.match(header,/const requested=new URLSearchParams\(location\.search\)\.get\('lang'\)/);
  assert.match(header,/normalizeLocale\(requested\|\|window\.EKODIUserLanguage\?\.getLocale/);
});


test('homepage loads the extended church locale runtime after core i18n',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const coreScript='<script src="church-i18n.js"></script>';
  const extendedScript='<script src="church-i18n-extended.js"></script>';
  assert.ok(html.includes(extendedScript),'homepage must load church-i18n-extended.js');
  assert.ok(html.indexOf(coreScript)<html.indexOf(extendedScript),'extended runtime must load after core church i18n');
});
