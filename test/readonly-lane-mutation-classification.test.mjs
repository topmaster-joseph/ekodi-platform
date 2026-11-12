// READONLY-MUTATION-CLASSIFY-001
//
// 2026-11-08 에 에코디 전체 공개 사이트 푸터로 방문통계가 적용됐다(1b578a2bf).
// 읽기전용 운영검증 레인들은 쓰기 요청을 끊고 "하나도 없어야 한다" 로 못박고
// 있었으므로, 운영이 정상인데도 그날부터 깨졌다. 측정된 실패:
//   verify-proposal-native-office.mjs:52  actual ['POST'] / expected []
// 세 곳이 같은 모양이었다. 하나(verify-proposal-native-production.mjs)는 #9515 로
// 고쳤고, 여기서 남은 두 곳을 같은 방식으로 맞춘다.
//
// 느슨하게 푸는 변경이 아니다. 두 곳 모두 **메서드만** 기록했기 때문에 방문통계
// 비콘과 실제 사용자 자료 제출을 구분할 수단 자체가 없었다. URL 까지 기록하고
// 공유 감사 분류기(교육 레인 5곳이 쓰는 것)로 판정하므로 결과는 더 엄격하다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classifyMutationSecurityBlock, TELEMETRY_URL} from '../scripts/education-native-security-observations.mjs';

const LANES = {
  'verify-proposal-native-office.mjs': 'No user data may be submitted to production',
  'ekodi-church-native-role-ui-canary.mjs': 'ordinary public site must not perform mutations',
};
const SRC = Object.fromEntries(Object.keys(LANES).map(name =>
  [name, fs.readFileSync(new URL('../scripts/' + name, import.meta.url), 'utf8')]));

test('두 레인 모두 쓰기 요청의 URL 을 기록한다', () => {
  // URL 이 없으면 분류 자체가 불가능하고, 분류기는 null 을 돌려 닫히는 쪽으로 실패한다.
  for (const [name, src] of Object.entries(SRC)) {
    assert.match(src, /blockedMutations\.push\(\{method,url:/, `${name}: URL 을 기록해야 한다`);
    assert.doesNotMatch(src, /blockedMutations\.push\(method\)/, `${name}: 메서드만 기록해서는 안 된다`);
  }
});

test('두 레인 모두 공유 분류기로 판정한다', () => {
  for (const [name, src] of Object.entries(SRC)) {
    assert.match(src, /from '\.\/education-native-security-observations\.mjs'/, `${name}: 분류기를 가져와야 한다`);
    assert.match(src, /blockedMutations\.filter\(item=>classifyMutationSecurityBlock\(item\.method,item\.url\)===null\)/,
      `${name}: 분류되지 않는 건만 걸러야 한다`);
  }
});

test('판정 실패는 여전히 단정으로 막힌다', () => {
  for (const [name, src] of Object.entries(SRC)) {
    assert.match(src, new RegExp(`assert\\.deepEqual\\(unexpectedMutations,\\[\\],'${LANES[name]}'\\)`),
      `${name}: 원래 메시지로 단정이 남아야 한다`);
  }
});

test('가짜 토큰 누출은 분류 대상이 아니고 항상 실패한다', () => {
  // 이것을 분류 경로에 넣으면 보안 가드가 사라진다.
  const src = SRC['ekodi-church-native-role-ui-canary.mjs'];
  assert.match(src, /blockedMethods\.push\('fixture-leak-blocked'\)/);
  assert.match(src, /assert\.deepEqual\(blockedMethods,\[\],'fixture token must never reach the network'\)/);
  // 누출 기록이 분류 배열로 흘러들어가서는 안 된다.
  const leak = src.slice(src.indexOf('fixture-leak-blocked') - 200, src.indexOf('fixture-leak-blocked') + 200);
  assert.doesNotMatch(leak, /blockedMutations/, '누출은 분류 배열과 섞이면 안 된다');
});

test('허용되는 것은 그 방문통계 하나뿐이다', () => {
  assert.equal(classifyMutationSecurityBlock('POST', TELEMETRY_URL), 'read-only-probe-blocked-network-mutation');
  for (const [method, url] of [
    ['POST', 'https://ekodi.kr/api/proposal/save'],
    ['POST', 'https://ekodi.kr/api/church/worship'],
    ['PUT', TELEMETRY_URL],
    ['PATCH', TELEMETRY_URL],
    ['DELETE', TELEMETRY_URL],
    ['POST', TELEMETRY_URL + '?x=1'],
    ['POST', 'https://evil.example' + new URL(TELEMETRY_URL).pathname],
  ]) {
    assert.equal(classifyMutationSecurityBlock(method, url), null, `${method} ${url} 가 허용되어서는 안 된다`);
  }
});

test('GET·HEAD·OPTIONS 만 통과하는 경계는 그대로다', () => {
  for (const [name, src] of Object.entries(SRC)) {
    assert.match(src, /\['GET','HEAD','OPTIONS'\]\.includes\(method\)/, `${name}: 허용 메서드 목록이 바뀌면 안 된다`);
  }
});
