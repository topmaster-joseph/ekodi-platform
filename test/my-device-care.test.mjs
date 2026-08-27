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

test('free Device Care supports multiple device contexts without claiming hardware access', () => {
  for (const marker of ['PC·POS·키오스크·태블릿', '센서', '서비스로봇']) assert.match(page, new RegExp(marker));
  for (const type of ['pc', 'pos', 'kiosk', 'tablet', 'sensor', 'robot', 'other']) assert.match(source, new RegExp(`${type}: Object\\.freeze`));
  assert.match(source, /실제 물리 기기의 건강점수가 아닙니다/);
  assert.match(source, /로봇의 위치·모터·배터리·센서 상태/);
  assert.match(source, /실제 에너지·환경 센서의 측정값이나 설정/);
});

test('browser care keeps optimization inside the EKODI web origin', () => {
  assert.match(source, /CACHE_ALLOWLIST/);
  assert.match(source, /registration\.update\(\)/);
  assert.match(source, /window\.confirm/);
  assert.doesNotMatch(source, /localStorage\.clear\s*\(/);
  assert.doesNotMatch(source, /\/api\/control\/devices/);
});

test('member page states the OS, physical-device and privacy boundary', () => {
  assert.match(page, /개인 파일 접근 안 함/);
  assert.match(page, /OS·기기 제어 자동실행 안 함/);
  assert.match(page, /POS 결제장치 제어/);
  assert.match(page, /로봇 이동·구동/);
  assert.match(page, /Agent\/전용 어댑터/);
});
