import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = p => readFile(new URL('../'+p,import.meta.url),'utf8');

test('shared user header progressively adopts only non-Mall brand+navigation rows',async()=>{
  const [js,css,policy]=await Promise.all([
    read('shell/user-ui-header.js'),read('shell/user-ui-shell.css'),read('docs/user-ui-module-principles.md')
  ]);
  assert.match(js,/const STANDARD_CLASS='ekodi-standard-header'/);
  assert.match(js,/const STANDARD_ROW_CLASS='ekodi-standard-header__row'/);
  assert.match(js,/function standardHeaderRow\(header\)/);
  assert.match(js,/function adoptStandardHeader\(header\)/);
  assert.match(js,/if\(!header\|\|header\.hasAttribute\(FALLBACK_ATTR\)\|\|!shouldEnable\(\)\)return null/);
  assert.match(js,/serviceId\(\)==='mall'/);
  assert.match(js,/location\.pathname/);
  assert.match(js,/header\.dataset\.ekodiHeaderStandard==='off'/);
  assert.match(js,/document\.documentElement\.dataset\.ekodiHeaderStandard==='off'/);
  assert.match(js,/const brand=children\.find/);
  assert.match(js,/const nav=children\.find/);
  assert.match(js,/header\.classList\.add\(STANDARD_CLASS\)/);
  assert.match(js,/row\.classList\.add\(STANDARD_ROW_CLASS\)/);
  assert.match(js,/adoptStandardHeader\(header\);/);
  assert.match(css,/\.ekodi-standard-header__row/);
  assert.match(css,/justify-content:space-between/);
  assert.match(css,/justify-content:flex-end/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/:not\(:has\(\[aria-haspopup\],\.nav-group,\.nav-submenu\)\)/);
  assert.match(policy,/비몰 공통 헤더 구조 표준 v1/);
  assert.doesNotMatch(js,/document\.createElement\('button'\).*로그아웃/);
});

test('representative service headers preserve their native logos, menus, and auth',async()=>{
  const pages=['index.html','books/publishing/index.html','education/research/index.html',
    'sites/business-cooperative/public/index.html','sites/pyeonggongmok/public/index.html',
    'space/ekodimission.page','sites/seonammedi/public/index.html'];
  for(const page of pages){
    const markup=await read(page);
    assert.match(markup,/<header\b/,'header '+page);
    assert.match(markup,/\bclass="[^"]*brand[^"]*"/,'brand '+page);
    assert.match(markup,/<nav\b/,'navigation '+page);
  }
  const mall=await read('sites/ekodi-mall/assets/supplier-ops.html');
  assert.doesNotMatch(mall,/ekodi-standard-header/,'Mall remains independently styled');
});

test('adoption does not force fixed positioning or change authorization state',async()=>{
  const [js,css]=await Promise.all([read('shell/user-ui-header.js'),read('shell/user-ui-shell.css')]);
  const adoption=js.slice(js.indexOf('function standardHeaderRow('),js.indexOf('function bindHomeAnchor('));
  assert.doesNotMatch(adoption,/location\.href=|fetch\(|auth\.|localStorage|document\.createElement\('a'\)/);
  const style=css.slice(css.indexOf('/* EKODI COMMON HEADER GRAMMAR v1'));
  assert.doesNotMatch(style,/position\s*:\s*(?:fixed|sticky)/);
  assert.doesNotMatch(style,/display\s*:\s*none\s*!important/);
  assert.match(style,/\[hidden\]/);
});
