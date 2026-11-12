// CHURCH-WORSHIP-ADMIN-STATE-001
//
// EKODI Church Native UI Capability Proof 가 "허용된 링크가 여전히 보이지 않는다" 로
// 깨져 있었다. 2026-11-12 측정값:
//   hidden:false, cssDisplay:flex, visibility:visible,
//   parentDisplay:flex, parentVisibility:visible, rect 0×0
// 조상 체인을 보면 여섯 단계 위 SECTION.church-weekly-focus 가 display:none 이었다.
//
// 운영 결함이 아니다. 교회 홈은 한 번에 한 구역만 보이는 압축 내비게이션이고
// (church-section-nav.js 가 church-section-active 를 토글, church-compact-navigation.css
// 가 나머지를 display:none!important), 예배관리 링크는 #weekly-worship 구역 안에 있다.
// 검사는 #worship 을 열어둔 상태에서 그 링크의 가시성을 요구했다.
//
// 그래서 방문자와 같은 방식으로 그 구역을 먼저 연다. 덤으로 게스트 단정이
// 의미를 얻는다 — 구역이 닫혀 있으면 어떤 링크든 안 보이므로 저절로 통과했다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SCRIPT = fs.readFileSync(new URL('../scripts/verify-church-live-ui-with-synthetic-session.mjs', import.meta.url), 'utf8');
const HTML = fs.readFileSync(new URL('../sites/ekodi-church/index.html', import.meta.url), 'utf8');
const NAV = fs.readFileSync(new URL('../sites/ekodi-church/church-section-nav.js', import.meta.url), 'utf8');
const LAYOUT = fs.readFileSync(new URL('../sites/ekodi-church/church-homepage-layout.css', import.meta.url), 'utf8');

test('링크는 실제로 #weekly-worship 구역 안에 있다', () => {
  // 전제가 무너지면(링크가 다른 구역으로 옮겨가면) 이 검사의 화면 상태도 틀려진다.
  const linkAt = HTML.indexOf('data-church-worship-admin');
  const sectionAt = HTML.indexOf('id="weekly-worship"');
  assert.ok(sectionAt > 0, '#weekly-worship 구역이 있어야 한다');
  assert.ok(linkAt > sectionAt, '예배관리 링크는 그 구역 뒤에 있어야 한다');
  assert.equal(HTML.split('church-weekly-focus').length - 1, 1, 'focus 구역은 하나여야 한다');
});

test('그 구역은 열지 않으면 배치되지 않는다', () => {
  assert.match(LAYOUT, /\.church-weekly-focus\{display:none!important\}/,
    '닫힌 상태가 display:none 이라는 전제');
  assert.match(NAV, /'weekly-worship'/, '내비게이션이 그 구역을 안다');
  assert.match(NAV, /classList\.toggle\('church-section-active'/, '구역 활성화 방식');
  assert.match(NAV, /addEventListener\('hashchange'/, '해시 변경으로 열린다');
});

test('검사가 가시성을 보기 전에 그 구역을 연다', () => {
  const open = SCRIPT.indexOf("location.hash='#weekly-worship'");
  assert.ok(open > 0, '구역을 여는 단계가 있어야 한다');
  assert.match(SCRIPT, /waitForFunction\(\(\)=>getComputedStyle\(document\.querySelector\('#weekly-worship'\)\)\.display!=='none'/,
    '열렸는지 확인해야 한다 — 기다리지 않으면 경쟁이 된다');
  const guest = SCRIPT.indexOf("'guest must never see management link'");
  const permitted = SCRIPT.indexOf('Permitted link remains visually hidden');
  assert.ok(open < guest, '게스트 단정도 구역이 열린 상태에서 해야 의미가 있다');
  assert.ok(open < permitted, '허용 단정은 구역이 열린 뒤여야 한다');
});

test('게스트·허용·회수 단정이 모두 남아 있다', () => {
  // 화면 상태를 고친 것이고 권한 판정을 느슨하게 한 것이 아니다.
  assert.match(SCRIPT, /assert\.equal\(await link\.isVisible\(\),false,'guest must never see management link'\)/);
  assert.match(SCRIPT, /\?\.hidden===false/, '허용되면 열려야 한다');
  assert.match(SCRIPT, /\?\.hidden===true/, '회수되면 닫혀야 한다');
  assert.match(SCRIPT, /assert\.equal\(await link\.getAttribute\('href'\),'\/ekodichurch\/admin\/worship'\)/);
});

test('실패 진단이 첫 미배치 조상을 지목한다', () => {
  // 요소와 부모만 보면 조상이 숨긴 경우를 영원히 못 찾는다. 실제로 그렇게 막혀 있었다.
  assert.match(SCRIPT, /firstHiddenAncestor:culprit/);
  assert.match(SCRIPT, /chain\.find\(item=>item\.display==='none'\|\|item\.visibility==='hidden'\)/);
  assert.match(SCRIPT, /while\(node&&chain\.length<12\)/, '체인에 상한이 있어야 한다');
  assert.match(SCRIPT, /classes:String\(node\.className\)\.slice\(0,80\)/, '기록에 상한이 있어야 한다');
});

test('조상 체인 수집에 상한이 있다', () => {
  const expr = /while\(node&&chain\.length<(\d+)\)/.exec(SCRIPT);
  assert.ok(expr && Number(expr[1]) <= 12, '조상 수 상한이 12 이하여야 한다');
  const trim = /classes:String\(node\.className\)\.slice\(0,(\d+)\)/.exec(SCRIPT);
  assert.ok(trim && Number(trim[1]) <= 120, 'class 문자열 상한이 있어야 한다');
});
