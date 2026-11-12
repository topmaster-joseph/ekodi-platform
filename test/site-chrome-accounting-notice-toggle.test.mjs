// ACCOUNTING-NOTICE-TOGGLE-001
//
// 회계공지는 각 사용자 사이트에 모두 공지하는 것이 원칙이고, 메뉴 자체의 노출
// 여부는 사이트관리자와 최고관리자가 정한다. 그래서 기본값은 켜짐이고 끄는
// 스위치가 site-chrome 헤더 설정에 들어간다.
//
// 이 토글을 먼저, 읽는 곳 없이 올린다. 공개 회계공지 페이지가 이 값을 따르도록
// 하는 변경은 다음 릴리스다 — 그러면 "스위치 없이 공개되는 창"이 한 번도
// 생기지 않는다.
//
// 끄는 것은 메뉴 노출만 가리는 것이고, 공개 집계 API의 권한 경계와는 별개다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EKODI_SITE_CHROME_DEFAULTS, siteChromeDefaults } from '../config/site-chrome-defaults.js';

const RUNTIME = fs.readFileSync(new URL('../site-chrome-runtime.js', import.meta.url), 'utf8');
const ADMIN = fs.readFileSync(new URL('../store-admin-engine.js', import.meta.url), 'utf8');
const CONTROL = fs.readFileSync(new URL('../api-worker.js', import.meta.url), 'utf8');

// 런타임의 실제 정규화를 그대로 떼어 쓴다. 규칙을 테스트에 다시 쓰면 잘못
// 배포된 기본값도 통과한다.
const bool = (() => {
  const start = RUNTIME.indexOf('function bool(value,fallback){');
  assert.ok(start > 0, 'bool helper must exist in the runtime');
  const end = RUNTIME.indexOf('\n}', start) + 2;
  // eslint-disable-next-line no-new-func
  return new Function(`${RUNTIME.slice(start, end)}; return bool;`)();
})();

test('원칙은 모두 공지 — 기본값이 켜짐이다', () => {
  assert.equal(EKODI_SITE_CHROME_DEFAULTS.header.accountingNotice, true);
  for (const site of ['에코디교회', '에코디선교회', '에코디비즈', '청계면상인회', '서남권 국립의대 소통센터']) {
    assert.equal(siteChromeDefaults(site, 'https://ekodi.kr/x').header.accountingNotice, true,
      `${site} 도 기본값은 공개여야 한다`);
  }
});

test('관리자가 끄면 꺼지고, 다시 켜면 켜진다', () => {
  assert.equal(bool(false, true), false);
  assert.equal(bool('false', true), false);
  assert.equal(bool(true, false), true);
  assert.equal(bool('true', false), true);
});

test('빈 값이나 모르는 값은 조용히 끄지 않고 기본값으로 떨어진다', () => {
  // 이게 없으면 헤더를 저장할 때마다 메뉴가 사라진다.
  for (const value of [undefined, null, '', 'yes', 'no', {}, [], NaN, 'False']) {
    assert.equal(bool(value, true), true, `${JSON.stringify(value)} 는 기본값 켜짐을 유지해야 한다`);
    assert.equal(bool(value, false), false, `${JSON.stringify(value)} 는 기본값 꺼짐을 유지해야 한다`);
  }
});

test('정규화된 헤더가 이 필드를 싣는다', () => {
  const header = RUNTIME.slice(RUNTIME.indexOf('function normalizeHeader'), RUNTIME.indexOf('function normalizeFooter'));
  assert.match(header, /accountingNotice:bool\(input\.accountingNotice,defaults\.accountingNotice\)/,
    '저장된 값이 있으면 그것을, 없으면 기본값을 쓴다');
});

test('사이트관리자가 자기 사이트에서 바꿀 수 있다', () => {
  assert.match(ADMIN, /<strong>회계공지 메뉴 노출<\/strong>/, '폼에 노출 제어가 있어야 한다');
  assert.match(ADMIN, /<select name="accountingNotice">/);
  assert.match(ADMIN, /accountingNotice:v\.accountingNotice!=='false'/, '제출 payload에 실려야 한다');
  // 전개 뒤에 와야 저장된 값을 덮어쓸 수 있다.
  const payload = ADMIN.slice(ADMIN.indexOf('header:{...(current.header||{})'));
  assert.ok(payload.indexOf('accountingNotice') < payload.indexOf('footer:{'),
    '헤더 payload 안에 있어야 한다');
});

test('최고관리자가 어느 사이트든 바꿀 수 있고 그 변경이 감사에 남는다', () => {
  // 필드를 더하는 것만으로 두 대상이 제어권을 갖는다. 그 경로가 살아 있음을 고정한다.
  const start = CONTROL.indexOf('const siteChromeMatch');
  assert.ok(start > 0, 'the per-site control route must exist');
  // PUBLIC_SITE_PREFIX 는 파일 앞쪽에서 선언되므로 반드시 start 이후에서 찾는다.
  const end = CONTROL.indexOf('PUBLIC_SITE_PREFIX', start);
  assert.ok(end > start);
  const route = CONTROL.slice(start, end);
  assert.match(route, /super_admin/, '최고관리자 게이트가 있어야 한다');
  assert.match(route, /putSiteChromeSettings\(env, siteChromeMatch\[1\], body, auth\.session\.email\)/,
    '임의 사이트를 지정해 저장하는 경로');
  assert.match(route, /writeAudit\(env, auth\.session, 'site_chrome\.update'/, '감사 기록이 남아야 한다');
});

test('노출을 끄는 것이 공개 API의 권한 경계를 대신하지 않는다', () => {
  // 메뉴를 가리는 것은 접근 제어가 아니다. 이 구분이 흐려지면 '숨김'을 보안으로
  // 착각하게 된다.
  const defaults = fs.readFileSync(new URL('../config/site-chrome-defaults.js', import.meta.url), 'utf8');
  // 주석이 줄바꿈으로 나뉘므로 주석 접두부를 지우고 한 줄로 본다.
  const prose = defaults.replace(/\n\s*\/\/ ?/gu, ' ');
  assert.match(prose, /메뉴 노출만 가리는 것이고, 공개 집계 API 자체의 권한 경계와는 별개/u,
    '그 구분이 설정 파일에 적혀 있어야 한다');
});
