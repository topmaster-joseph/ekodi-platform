// PROPOSAL-READONLY-TELEMETRY-001
//
// 2026-11-08 에 에코디 전체 공개 사이트 푸터로 방문통계가 적용됐다(1b578a2bf).
// 제안서 운영 검증 레인은 읽기전용 탐침으로 도는데, 그 탐침이 방문통계 POST 를
// 끊는다. 레인은 "차단된 변경 수 = 0" 을 못박고 있었으므로 그날부터 깨졌다.
// (마지막 성공 2026-11-04, 측정된 실패: blockedMutations 1 !== 0.)
//
// 고치는 방향은 느슨하게 푸는 것이 아니다. 교육 레인 5곳이 이미 쓰는 공유 감사
// 분류기를 그대로 쓴다. 그것은 메서드와 URL 을 완전일치로 보므로, 분류되지 않는
// 변경·요청은 전보다 더 분명하게 실패한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  classifyMutationSecurityBlock,
  classifyRequestSecurityBlock,
  TELEMETRY_URL,
} from '../scripts/education-native-security-observations.mjs';

const SCRIPT = fs.readFileSync(new URL('../scripts/verify-proposal-native-production.mjs', import.meta.url), 'utf8');
const WORKER = fs.readFileSync(new URL('../scripts/ekodi-background-browser-worker.mjs', import.meta.url), 'utf8');

// 2026-11-12 실행 43213917212 에서 실제로 관측된 값.
const OBSERVED_MUTATION = { method: 'POST', url: 'https://ekodi.kr/api/telemetry/visit' };
const OBSERVED_FAILURES = [
  { url: 'https://static.cloudflareinsights.com/beacon.min.js/vce701823e78c4301a35b7e07294d87301792088814092', failure: 'csp' },
  { url: 'https://ekodi.kr/api/telemetry/visit', failure: 'net::ERR_BLOCKED_BY_CLIENT.Inspector' },
];

test('측정된 방문통계 차단이 이름 붙은 하나로 분류된다', () => {
  assert.equal(OBSERVED_MUTATION.url, TELEMETRY_URL, '측정값이 공유 상수와 같은 주소여야 한다');
  assert.equal(
    classifyMutationSecurityBlock(OBSERVED_MUTATION.method, OBSERVED_MUTATION.url),
    'read-only-probe-blocked-network-mutation');
  for (const item of OBSERVED_FAILURES) {
    assert.ok(classifyRequestSecurityBlock(item.url, item.failure),
      `${item.url} 는 분류돼야 한다`);
  }
});

test('그 밖의 쓰기 요청은 분류되지 않고 그대로 실패한다', () => {
  // 이게 비면 "읽기전용" 이라는 말이 의미를 잃는다.
  const forbidden = [
    ['POST', 'https://ekodi.kr/api/proposal/save'],
    ['PUT', TELEMETRY_URL],
    ['DELETE', TELEMETRY_URL],
    ['POST', 'https://ekodi.kr/api/telemetry/visit/../../admin'],
    ['POST', 'https://evil.example/api/telemetry/visit'],
    ['POST', TELEMETRY_URL + '?x=1'],
    ['', TELEMETRY_URL],
  ];
  for (const [method, url] of forbidden) {
    assert.equal(classifyMutationSecurityBlock(method, url), null,
      `${method} ${url} 가 허용되어서는 안 된다`);
  }
});

test('그 밖의 실패 요청도 분류되지 않는다', () => {
  const forbidden = [
    ['https://ekodi.kr/proposal/client.js', 'csp'],
    ['https://ekodi.kr/proposal/app.css', 'net::ERR_FAILED'],
    [TELEMETRY_URL, 'csp'],
    ['https://static.cloudflareinsights.com/beacon.min.js/x', 'net::ERR_FAILED'],
    ['https://cloudflareinsights.com.evil.example/beacon.min.js/x', 'csp'],
  ];
  for (const [url, failure] of forbidden) {
    assert.equal(classifyRequestSecurityBlock(url, failure), null,
      `${url} (${failure}) 가 허용되어서는 안 된다`);
  }
});

test('제안서 레인이 자체 예외 대신 공유 분류기를 쓴다', () => {
  assert.match(SCRIPT, /from '\.\/education-native-security-observations\.mjs'/,
    '공유 감사 분류기를 가져와야 한다');
  assert.match(SCRIPT, /classifyMutationSecurityBlock\(item\.method,item\.url\)/);
  assert.match(SCRIPT, /classifyRequestSecurityBlock\(item\.url,item\.failure\)/);
  // 운영이 정상인데 레인을 깨뜨렸던 단정.
  assert.doesNotMatch(SCRIPT, /blockedMutations\.length\s*,\s*0/,
    '차단된 변경 수를 0 으로 못박아서는 안 된다');
  // 접두사만 보고 통과시키던 자체 예외.
  assert.doesNotMatch(SCRIPT, /item\.url\.startsWith\('https:\/\/static\.cloudflareinsights\.com\//,
    '자체 접두사 예외는 공유 분류기로 대체돼야 한다');
});

test('분류되지 않은 건은 두 종류 모두 단정으로 막힌다', () => {
  for (const name of ['unexpectedMutations', 'unexpectedFailures']) {
    const decl = new RegExp(`const ${name}=result\\.(blockedMutations|requestFailures)\\.filter`);
    assert.match(SCRIPT, decl, `${name} 가 걸러져야 한다`);
    assert.match(SCRIPT, new RegExp(`assert\\.deepEqual\\(${name},\\[\\]`),
      `${name} 가 비어 있어야 한다는 단정이 있어야 한다`);
  }
});

test('하네스가 분류기에 필요한 두 필드를 싣는다', () => {
  // method 가 빠지면 분류기는 null 을 돌려주고 레인은 닫히는 쪽으로 실패한다.
  // 조용히 통과하지는 않지만, 배선이 끊긴 것을 여기서 먼저 잡는다.
  assert.match(WORKER, /blockedMutations\.push\(\{method,url:/);
});

test('증거에 관측된 차단의 이름이 남는다', () => {
  assert.match(SCRIPT, /const observedSecurityBlocks=\[\.\.\.new Set\(\[\.\.\.mutationBlockKinds,\.\.\.requestBlockKinds\]\.filter\(Boolean\)\)\]\.sort\(\)/);
  assert.match(SCRIPT, /uiEditorFunctional:true,observedSecurityBlocks,/,
    '프로필별 증거에 실려야 한다');
});
