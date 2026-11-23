// DEVOTION-ORDER-EVIDENCE-001
//
// 2026-11-12 실행 43213917296 에서 desktop-church-order 가 깨졌는데 증거가 `{}`
// 뿐이었다. 그 검사는 네 조건의 논리곱이므로, 어느 조건이 왜 깨졌는지 알 수 없다.
// 운영 페이지는 레인 밖에서 열 수 없으니 증거가 없으면 조치도 할 수 없다.
//
// 이 테스트는 검사를 느슨하게 만들지 않는다. 판정은 그대로 네 조건의 논리곱이고,
// 실패할 때 무엇이 어긋났는지 기록만 남게 한다. 기록은 상한이 있어야 한다 —
// 운영 페이지 전체를 로그로 쏟으면 증거가 아니라 소음이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SRC = fs.readFileSync(new URL('../scripts/verify-devotion-native-sandbox.mjs', import.meta.url), 'utf8');
const ORDER_CHECK = (() => {
  const start = SRC.indexOf("-order',state.scriptureBeforeTabs");
  assert.ok(start > 0, 'order check must exist');
  const end = SRC.indexOf('-future-link', start);
  assert.ok(end > start);
  return SRC.slice(start, end);
})();

test('판정은 그대로 네 조건의 논리곱이다', () => {
  assert.match(ORDER_CHECK,
    /state\.scriptureBeforeTabs&&state\.scriptureBeforeNotice&&state\.shareAfterNotice&&state\.noticeShareNonoverlap/,
    '조건 하나라도 빠지면 통과 기준이 느슨해진다');
});

test('실패 증거에 네 조건이 각각 남는다', () => {
  for (const key of ['scriptureBeforeTabs', 'scriptureBeforeNotice', 'shareAfterNotice', 'noticeShareNonoverlap']) {
    assert.match(ORDER_CHECK, new RegExp(`${key}:state\\.${key}`), `${key} 가 증거에 없다`);
  }
});

test('겹침 판정을 재현할 수 있는 기하 증거가 남는다', () => {
  // noticeShareNonoverlap 은 사각형 비교다. 참·거짓만 남기면 왜 어긋났는지 모른다.
  for (const key of ['childOrder', 'noticeRect', 'shareRect']) {
    assert.match(ORDER_CHECK, new RegExp(`${key}:state\\.${key}`), `${key} 가 증거에 없다`);
    assert.match(SRC, new RegExp(`${key}:`), `${key} 가 수집되지 않는다`);
  }
  assert.match(SRC, /noticeRect:\(\(\)=>\{const r=notice\?\.getBoundingClientRect\(\);/);
  assert.match(SRC, /shareRect:\(\(\)=>\{const r=share\?\.getBoundingClientRect\(\);/);
  for (const field of ['top', 'bottom', 'height']) {
    assert.ok(new RegExp(`${field}:Math\\.round`).test(SRC), `${field} 가 기록되지 않는다`);
  }
});

test('증거에는 상한이 있다', () => {
  // 실제 수집 식을 떼어 쓴다. 규칙을 테스트에 다시 쓰면 상한 없는 구현도 통과한다.
  const expr = /childOrder:(order\.slice\(0,\d+\)\.map\(text=>String\(text\)\.slice\(0,\d+\)\))/.exec(SRC);
  assert.ok(expr, 'childOrder 수집 식을 찾지 못했다');
  // eslint-disable-next-line no-new-func
  const bound = new Function('order', `return ${expr[1]};`);
  const flood = Array.from({ length: 500 }, () => 'x'.repeat(5000));
  const out = bound(flood);
  assert.ok(out.length <= 24, `자녀 수 상한이 없다 (${out.length}개)`);
  for (const text of out) assert.ok(text.length <= 80, '각 항목 길이 상한이 없다');
  // 정상 입력은 그대로 보존돼야 한다 — 상한이 증거를 망가뜨리면 안 된다.
  assert.deepEqual(bound(['dv-scripture-section', 'dv-tabs', 'dv-notice', 'dv-share-row']),
    ['dv-scripture-section', 'dv-tabs', 'dv-notice', 'dv-share-row']);
  assert.deepEqual(bound([]), []);
});

test('겹침 판정이 순서 색인과 같은 요소를 본다', () => {
  // find() 는 직계자녀 색인이다. 겹침 판정이 문서 전역 querySelector 를 쓰면
  // 숨겨진 탭 패널 안의 .dv-share-row(2026-10-27 84837a632 이후 존재)를 집고,
  // 숨겨진 요소의 사각형은 0×0 이므로 판정이 늘 거짓이 된다. 실제로 그렇게 깨졌다.
  assert.match(SRC, /const notice=el\.querySelector\(':scope > \.dv-notice'\)/);
  assert.match(SRC, /const share=el\.querySelector\(':scope > \.dv-share-row'\)/);
  assert.doesNotMatch(SRC, /querySelector\('\.dv-share-row'\)/,
    '전역 선택자로 돌아가서는 안 된다');
  assert.doesNotMatch(SRC, /querySelector\('\.dv-notice'\)/,
    '전역 선택자로 돌아가서는 안 된다');
});

test('직계자녀 색인 쪽은 그대로다', () => {
  // 선택자만 좁혔고 순서 판정 방식은 바꾸지 않았다.
  assert.match(SRC, /const order=\[\.\.\.el\.children\]\.map/);
  assert.match(SRC, /const find=klass=>order\.findIndex/);
});

test('순서 증거에 페이지 본문을 쏟지 않는다', () => {
  // body/innerText 는 이미 다른 검사가 상한을 두고 쓴다. 여기 끌어오면 로그가 터진다.
  assert.doesNotMatch(ORDER_CHECK, /body:|innerText|scriptureText/,
    '순서 증거는 구조와 기하만 담아야 한다');
});

test('실패 시 증거가 예외 메시지에도 실린다', () => {
  // CI 로그에서 바로 읽혀야 한다. 던지기만 하고 detail 을 버리면 증거가 사라진다.
  assert.match(SRC, /throw new Error\('sandbox_check_failed:'\+name\+' '\+JSON\.stringify\(detail\)\)/);
});
