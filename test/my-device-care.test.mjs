import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../my/device-care.js', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../my/device-care/index.html', import.meta.url), 'utf8');
const home = fs.readFileSync(new URL('../my/index.html', import.meta.url), 'utf8');

test('free members can discover My Device Care from My EKODI', () => {
  assert.match(home, /href="\/device-care\/">내 PC<\/a>/);
  assert.match(page, /FREE MEMBER/);
  assert.match(page, /무료회원/);
});

test('browser care keeps optimization inside the EKODI web origin', () => {
  assert.match(source, /CACHE_ALLOWLIST/);
  assert.match(source, /registration\.update\(\)/);
  assert.match(source, /window\.confirm/);
  assert.doesNotMatch(source, /localStorage\.clear\s*\(/);
  assert.doesNotMatch(source, /caches\.keys\(\)[\s\S]*caches\.delete\(name\)[\s\S]*without/i);
  assert.doesNotMatch(source, /\/api\/control\/devices/);
});

test('member page states the OS and privacy boundary', () => {
  assert.match(page, /개인 파일 접근 안 함/);
  assert.match(page, /Windows 설정 자동변경 안 함/);
  assert.match(page, /Device Agent/);
});
