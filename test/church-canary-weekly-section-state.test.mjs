// CHURCH-CANARY-WEEKLY-STATE-001
//
// 교회 역할 UI 캐너리가 실행 43219675210 에서 시간초과로 깨졌다:
//   locator.selectOption: Timeout 30000ms exceeded.
//   waiting for locator('[data-church-weekly]').locator('[data-weekly-date]')
//   locator resolved to <select data-weekly-date …> — element is not visible
//
// [data-church-weekly] 는 section.church-weekly-focus#weekly-worship 이고, 교회 홈은
// 한 번에 한 구역만 보이는 압축 내비게이션이다. 열기 전에는 display:none 이므로
// 그 안의 요소는 보이지 않는다. 운영 결함이 아니라 검사가 틀린 화면 상태를 본 것이다.
// (같은 원인으로 역량증명 레인의 예배관리 링크가 rect 0×0 으로 측정됐다.)
//
// 그래서 방문자와 같은 방식으로 구역을 먼저 연다. 이 테스트는 그 순서를 고정한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SRC = fs.readFileSync(new URL('../scripts/ekodi-church-native-role-ui-canary.mjs', import.meta.url), 'utf8');
const HTML = fs.readFileSync(new URL('../sites/ekodi-church/index.html', import.meta.url), 'utf8');
const NAV = fs.readFileSync(new URL('../sites/ekodi-church/church-section-nav.js', import.meta.url), 'utf8');

test('전제: 주보 구역이 열기 전에는 배치되지 않는다', () => {
  // 전제가 바뀌면 이 순서도 다시 봐야 한다.
  assert.match(HTML, /<section class="church-weekly-focus" id="weekly-worship" data-church-weekly/,
    '[data-church-weekly] 가 그 구역 자신이어야 한다');
  const layout = fs.readFileSync(new URL('../sites/ekodi-church/church-homepage-layout.css', import.meta.url), 'utf8');
  assert.match(layout, /\.church-weekly-focus\{display:none!important\}/);
  assert.match(NAV, /addEventListener\('hashchange'/, '해시 변경으로 열린다');
});

test('캐너리가 구역을 먼저 열고 그 안을 조작한다', () => {
  const open = SRC.indexOf("location.hash='#weekly-worship'");
  const wait = SRC.indexOf("document.querySelector('#weekly-worship')");
  const locate = SRC.indexOf("page.locator('[data-church-weekly]')");
  const select = SRC.indexOf('picker.selectOption');
  assert.ok(open > 0, '구역을 여는 단계가 있어야 한다');
  assert.ok(wait > open, '열렸는지 기다려야 한다 — 기다리지 않으면 경쟁이 된다');
  assert.ok(locate > wait, '구역을 연 뒤에 그 안을 찾아야 한다');
  assert.ok(select > locate, '선택 조작은 그 뒤여야 한다');
  assert.match(SRC, /waitForFunction\(\(\)=>getComputedStyle\(document\.querySelector\('#weekly-worship'\)\)\.display!=='none'/);
});

test('첫 화면 진입과 출처 단정은 그대로다', () => {
  // 구역을 여는 것은 해시 변경이고 재진입이 아니다. 출처가 바뀌면 안 된다.
  assert.match(SRC, /assert\.equal\(landing\?\.status\(\),200,'live Church public homepage must respond 200'\)/);
  assert.match(SRC, /assert\.equal\(new URL\(page\.url\(\)\)\.origin,ORIGIN,'must remain at canonical EKODI origin'\)/);
  const goto = SRC.indexOf('page.goto(PAGE');
  assert.ok(goto < SRC.indexOf("location.hash='#weekly-worship'"), '진입이 먼저여야 한다');
  assert.equal(SRC.split('page.goto(').length - 1, 1, '재진입을 추가해서는 안 된다');
});

test('권한 판정은 화면 상태와 무관하게 남아 있다', () => {
  // 관리 링크 판정은 hidden 속성을 본다. 구역을 여는 것과 섞이면 안 된다.
  assert.equal(SRC.split('?.hidden===false').length - 1, 2, '허용 판정 두 곳');
  // '?.hidden===true' 는 게스트 증거 수집(135행)에도 있으므로, 회수 판정은
  // 기다리는 형태로 못박는다. 느슨하게 보면 삭제해도 통과한다.
  assert.match(SRC, /waitForFunction\(\(\)=>document\.querySelector\('\[data-church-worship-admin\]'\)\?\.hidden===true,null,\{timeout:\d+\}\)/,
    '회수되면 닫히기를 기다리는 판정');
  assert.match(SRC, /assert\.deepEqual\(blockedMethods,\[\],'fixture token must never reach the network'\)/);
  assert.match(SRC, /assert\.deepEqual\(unexpectedMutations,\[\],'ordinary public site must not perform mutations'\)/);
});
