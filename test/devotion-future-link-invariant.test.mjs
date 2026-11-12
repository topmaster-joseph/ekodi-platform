// DEVOTION-FUTURE-LINK-INVARIANT-001
//
// 묵상 샌드박스의 desktop-church-future-link 가 2026-11-12 운영 실행(43226292254)에서
// {"nextHidden":false} 로 깨졌다. 검사는 고정 날짜 DAY='2026-10-26' 을 열고 다음날
// 링크가 숨겨져 있기를 요구했다.
//
// 운영은 맞다. bible/devotion.js 는 nextDate<=today 면 링크를 연다. 2026-10-27 은
// 이미 과거이므로 열려야 한다. 기대값이 달력과 함께 썩은 것이다 — 그 기대는 DAY 가
// 오늘이던 하루만 참이었고, 레인의 마지막 실행이 바로 그날(2026-10-26)이었다.
//
// 그래서 불변식을 고정한다: 숨김 == (다음 날짜가 미래). 양방향 모두 못박는다.
//  - 미래면 숨기고 href 도 없어야 한다(fail-closed).
//  - 과거면 열려야 하고 주소가 바로 그 다음 날짜여야 한다(미래로 건너뛰지 않는다).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SRC = fs.readFileSync(new URL('../scripts/verify-devotion-native-sandbox.mjs', import.meta.url), 'utf8');

// 실제 계산식을 떼어 쓴다. 규칙을 다시 쓰면 틀린 구현도 통과한다.
const nextDayOf = (() => {
  const m = /const NEXT_DAY=(new Date\(Date\.UTC\(\.\.\.DAY\.split\('-'\)[\s\S]*?)\.toISOString\(\)\.slice\(0,10\);/.exec(SRC);
  assert.ok(m, 'NEXT_DAY 계산식을 찾지 못했다');
  // eslint-disable-next-line no-new-func
  return new Function('DAY', `return (${m[1]}).toISOString().slice(0,10);`);
})();

test('다음 날짜 계산이 경계에서도 맞다', () => {
  assert.equal(nextDayOf('2026-10-26'), '2026-10-27');
  assert.equal(nextDayOf('2026-02-28'), '2026-03-01', '평년 2월');
  assert.equal(nextDayOf('2024-02-28'), '2024-02-29', '윤년 2월');
  assert.equal(nextDayOf('2024-02-29'), '2024-03-01', '윤일 다음');
  assert.equal(nextDayOf('2026-12-31'), '2027-01-01', '연말');
  assert.equal(nextDayOf('2026-01-31'), '2026-02-01', '월말');
});

test('고정된 숨김 기대가 사라졌다', () => {
  // 이 한 줄이 돌아오면 다음 날 다시 썩는다.
  assert.doesNotMatch(SRC, /state\.nextHidden===true/, '고정 기대값을 쓰면 안 된다');
  assert.doesNotMatch(SRC, /nextHidden:el\.querySelector/, '참·거짓만 수집하면 판정할 수 없다');
});

test('판정이 불변식이다 — 숨김 == 다음날이 미래', () => {
  const block = SRC.slice(SRC.indexOf("-future-link'"), SRC.indexOf("-guest-admin-closed'"));
  assert.match(block, /link\.hidden===link\.shouldHide/, '양쪽을 비교해야 한다');
  assert.match(SRC, /shouldHide:nextDay>today/, '미래 여부로 결정해야 한다');
  assert.match(SRC, /today=new Date\(\)\.toISOString\(\)\.slice\(0,10\)/, '오늘을 브라우저에서 읽어야 한다');
});

test('미래면 주소까지 닫혀 있어야 한다', () => {
  const block = SRC.slice(SRC.indexOf("-future-link'"), SRC.indexOf("-guest-admin-closed'"));
  assert.match(block, /link\.href===null&&link\.ariaDisabled==='true'/,
    'fail-closed: 숨기는 것만으로는 부족하고 주소와 aria 도 닫혀야 한다');
});

test('과거면 열려야 하고 바로 다음 날짜여야 한다', () => {
  const block = SRC.slice(SRC.indexOf("-future-link'"), SRC.indexOf("-guest-admin-closed'"));
  assert.match(block, /typeof link\.href==='string'&&link\.href\.includes\(link\.nextDate\)/,
    '과거 묵상으로 갈 수 있어야 하고, 미래로 건너뛰면 안 된다');
});

test('판정 근거가 증거로 남는다', () => {
  assert.match(SRC, /href:link\?\.getAttribute\('href'\)\|\|null/);
  assert.match(SRC, /ariaDisabled:link\?\.getAttribute\('aria-disabled'\)\|\|null/);
  assert.match(SRC, /nextDate:nextDay/);
  assert.match(SRC, /today,/);
  // 검사 실패 시 그 묶음을 그대로 넘긴다.
  const block = SRC.slice(SRC.indexOf("-future-link'"), SRC.indexOf("-guest-admin-closed'"));
  assert.match(block, /\n\s*link\);/, '증거를 그대로 전달해야 한다');
});

test('불변식을 양방향으로 모사해 본다', () => {
  // 판정식을 떼어 양쪽 경우를 모두 통과·실패시켜 본다.
  const block = SRC.slice(SRC.indexOf("-future-link'"), SRC.indexOf("-guest-admin-closed'"));
  const m = /-future-link',\n([\s\S]*?),\n\s*link\);/.exec(block);
  assert.ok(m, '판정식을 찾지 못했다');
  // eslint-disable-next-line no-new-func
  const verdict = new Function('link', `return !!(${m[1]});`);
  // 미래 날짜: 닫혀 있어야 통과
  assert.equal(verdict({ hidden: true, shouldHide: true, href: null, ariaDisabled: 'true', nextDate: '2099-01-01' }), true);
  assert.equal(verdict({ hidden: false, shouldHide: true, href: null, ariaDisabled: 'true', nextDate: '2099-01-01' }), false, '미래인데 보이면 실패');
  assert.equal(verdict({ hidden: true, shouldHide: true, href: '/bible/devotion/2099-01-01', ariaDisabled: 'true', nextDate: '2099-01-01' }), false, '숨겼어도 주소가 남으면 실패');
  assert.equal(verdict({ hidden: true, shouldHide: true, href: null, ariaDisabled: 'false', nextDate: '2099-01-01' }), false, 'aria 가 열려 있으면 실패');
  // 과거 날짜: 열려 있고 주소가 맞아야 통과
  assert.equal(verdict({ hidden: false, shouldHide: false, href: '/bible/devotion/2026-10-27', ariaDisabled: 'false', nextDate: '2026-10-27' }), true);
  assert.equal(verdict({ hidden: true, shouldHide: false, href: '/bible/devotion/2026-10-27', ariaDisabled: 'false', nextDate: '2026-10-27' }), false, '과거인데 숨기면 실패');
  assert.equal(verdict({ hidden: false, shouldHide: false, href: '/bible/devotion/2026-12-25', ariaDisabled: 'false', nextDate: '2026-10-27' }), false, '다른 날짜로 건너뛰면 실패');
  assert.equal(verdict({ hidden: false, shouldHide: false, href: null, ariaDisabled: 'false', nextDate: '2026-10-27' }), false, '열렸는데 주소가 없으면 실패');
});
