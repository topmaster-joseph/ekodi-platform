import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
test('contextual Church manager has official translations in all nine page locales',async()=>{
 const [html,core,extended]=await Promise.all([read('index.html'),read('church-i18n.js'),read('church-i18n-extended.js')]);
 assert.match(html,/data-church-worship-admin[^>]+hidden/);
 assert.match(core,/'예배자료 관리':\{en:'[^']+',\s*'zh-CN':'[^']+',\s*ja:'[^']+'\}/);
 const line=extended.split('\n').find(row=>row.startsWith("add('예배자료 관리',"));
 assert.ok(line,'five extended translations are necessary');
 assert.equal((line.match(/','/g)||[]).length,5,'the translation entry must contain Korean plus five localizations');
 assert.match(extended,/if\(translated===source\)continue;/,'untranslated Korean must not cause an endless MutationObserver loop');
});
