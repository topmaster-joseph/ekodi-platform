import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('central category interactions run as same-origin external JS, preserving strict CSP',async()=>{
  const [home,script,css,headers]=await Promise.all([
    read('sites/seonammedi/public/index.html'),
    read('sites/seonammedi/public/central-category-runtime.js'),
    read('sites/seonammedi/public/central-category-menu.css'),
    read('_headers')
  ]);
  assert.doesNotMatch(home,/<script id="central-category-menu-script">/);
  assert.ok(home.includes('<script src="/seonammedi/central-category-runtime.js?v=20261020-section-title-1" defer></script>'));
  assert.match(home,/<link rel="stylesheet" href="\/seonammedi\/central-category-menu\.css">/);/* 2026-10-20: absolute so deep paths (/notices/<id>) load it */
  assert.match(home,/id="central-category-panel"[^>]*hidden/);
  assert.match(home,/id="central-category-buttons"/);
  assert.match(script,/const categories=\{/);
  for(const text of ['활동이력','관련소식','소통채널','페이스북','인스타그램','유튜브'])
    assert.ok(script.includes(text),'missing dynamic category '+text);
  assert.ok(!script.includes('"공지":'));
  assert.doesNotMatch(script,/noticePreview|renderNoticePreview/);
  assert.ok(script.includes('panel.hidden=false'));
  assert.match(script,/buttons\.replaceChildren\(\)/);
  assert.match(css,/\.central-category-buttons\{display:flex;flex-wrap:wrap/);
  assert.match(headers,/\/seonammedi\/\*[\s\S]*?script-src 'self'/);
  assert.doesNotMatch(headers.slice(headers.indexOf('/seonammedi/*'),headers.indexOf('/seonammedi/admin/*')),/script-src[^;\n]*unsafe-inline/);
});
