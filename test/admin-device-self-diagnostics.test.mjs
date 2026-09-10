import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const loader = fs.readFileSync(new URL('../admin-demand-loader.js', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../device-browser-diagnostics.js', import.meta.url), 'utf8');
const style = fs.readFileSync(new URL('../device-browser-diagnostics.css', import.meta.url), 'utf8');
const build = fs.readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');

test('admin device menu is localized and lazy-loads self diagnostics', () => {
  assert.match(loader, /label: '실행 인프라'/);
  assert.match(loader, /device-browser-diagnostics\.css/);
  assert.match(loader, /device-browser-diagnostics\.js/);
});

test('admin browser diagnostics is included in production dist assets', () => {
  assert.match(build, /'device-browser-diagnostics\.css'/);
  assert.match(build, /'device-browser-diagnostics\.js'/);
});

test('admin browser diagnostics stays local and browser-scoped', () => {
  assert.match(source, /현재 관리자 브라우저 진단/);
  assert.match(source, /서버로 업로드하지 않습니다/);
  assert.match(source, /CACHE_ALLOWLIST/);
  assert.match(source, /registration\.update\(\)/);
  assert.match(source, /window\.confirm/);
  assert.doesNotMatch(source, /localStorage\.clear\s*\(/);
  assert.doesNotMatch(source, /\/api\/control\/devices/);
  assert.doesNotMatch(source, /fetch\([^\n]*method\s*:\s*['\"]POST['\"]/);
});

test('admin browser diagnostics remains responsive', () => {
  assert.match(style, /@media\(max-width:720px\)/);
  assert.match(style, /@media\(max-width:460px\)/);
});
