// PUBLIC-ACCOUNTING-NOTICE-VISIBILITY-001
//
// 회계공지는 각 사용자 사이트에 모두 공지하는 것이 원칙이고, 메뉴 자체의 노출
// 여부는 사이트관리자와 최고관리자가 정한다. 토글은 site-chrome 헤더 설정에
// 먼저 들어갔다(ACCOUNTING-NOTICE-TOGGLE-001). 이 테스트는 공용 헤더가 그 값을
// 실제로 따르는지를 못박는다.
//
// 원래 PR #8952 는 설정을 읽기 전에 메뉴를 동기적으로 넣었다. 그러면 토글이
// 아무 효과가 없다. 주입을 site-chrome 이 해결된 뒤로 옮겼다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runInNewContext } from 'node:vm';

const SOURCE = fs.readFileSync(new URL('../shell/user-ui-header.js', import.meta.url), 'utf8');

// 저장소의 기존 방식: 서빙되는 모듈에서 해당 함수만 떼어 VM 에서 실제로 돌린다.
function menuFn() {
  const start = SOURCE.indexOf('function ensureAccountingNoticeMenu(');
  assert.ok(start > 0, 'the menu function must exist');
  const end = SOURCE.indexOf('\n}', start) + 2;
  return SOURCE.slice(start, end);
}

function run({ site, accountingNotice, chromeMissing = false, surface = 'public', existingHref = null, nav = true }) {
  const appended = [];
  const anchors = existingHref ? [{ getAttribute: () => existingHref }] : [];
  const navNode = { append: node => appended.push(node) };
  const element = () => ({
    dataset: {}, textContent: '', href: '', attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
  });
  const header = {
    querySelectorAll: () => anchors,
    querySelector: () => (nav ? navNode : null),
  };
  const context = {
    location: { pathname: `/${site}/`, href: `https://ekodi.kr/${site}/` },
    URL,
    document: { createElement: () => element() },
    surface: () => surface,
    ACCOUNTING_NOTICE_SITES: new Set(['ekodibiz', 'ekodichurch', 'ekodimission', 'cgma', 'seonammedi']),
  };
  const fn = runInNewContext(`${menuFn()}; ensureAccountingNoticeMenu`, context);
  const chrome = chromeMissing ? null : { header: { accountingNotice } };
  fn(header, chrome);
  return { appended };
}

const SITES = ['ekodibiz', 'ekodichurch', 'ekodimission', 'cgma', 'seonammedi'];

test('설정이 켜져 있으면 다섯 사이트 모두에 메뉴가 생긴다', () => {
  for (const site of SITES) {
    const { appended } = run({ site, accountingNotice: true });
    assert.equal(appended.length, 1, `${site} 에 메뉴가 생겨야 한다`);
    assert.equal(appended[0].textContent, '회계공지');
    assert.equal(appended[0].href, `/${site}/accounting`);
    assert.equal(appended[0].dataset.ekodiAccountingNotice, 'true');
  }
});

test('관리자가 끄면 메뉴가 생기지 않는다', () => {
  for (const site of SITES) {
    assert.deepEqual(run({ site, accountingNotice: false }).appended, [], `${site} 는 숨겨져야 한다`);
  }
});

test('설정을 확인하지 못하면 넣지 않는다', () => {
  // 못 읽은 상태에서 띄우면 관리자의 '숨김' 결정을 덮어쓴다. 링크를 보류해도
  // 페이지는 주소로 접근할 수 있고 다음 적재에서 다시 나타난다.
  assert.deepEqual(run({ site: 'ekodichurch', chromeMissing: true }).appended, []);
  for (const value of [undefined, null, '', 'true', 1, {}]) {
    assert.deepEqual(run({ site: 'ekodichurch', accountingNotice: value }).appended, [],
      `${JSON.stringify(value)} 는 '켜짐 확인'이 아니다`);
  }
});

test('허용된 사이트가 아니면 켜져 있어도 생기지 않는다', () => {
  for (const site of ['ekodimall', 'books', 'invest', 'learn', '']) {
    assert.deepEqual(run({ site, accountingNotice: true }).appended, []);
  }
});

test('관리 화면에는 생기지 않는다', () => {
  assert.deepEqual(run({ site: 'ekodichurch', accountingNotice: true, surface: 'admin' }).appended, []);
});

test('이미 같은 링크가 있으면 중복해서 넣지 않는다', () => {
  assert.deepEqual(run({ site: 'ekodichurch', accountingNotice: true, existingHref: '/ekodichurch/accounting' }).appended, []);
});

test('넣을 자리가 없으면 조용히 넘어간다', () => {
  assert.deepEqual(run({ site: 'ekodichurch', accountingNotice: true, nav: false }).appended, []);
});

test('메뉴 주입이 설정이 해결된 뒤에만 일어난다', () => {
  // 동기 호출이 남아 있으면 토글이 아무 효과가 없다.
  assert.doesNotMatch(SOURCE, /adoptStandardHeader\(header\);\s*\n\s*ensureAccountingNoticeMenu\(header\);/,
    '설정을 읽기 전에 부르는 호출이 남아 있어서는 안 된다');
  // 함수 정의 줄도 같은 문자열을 포함하므로, 호출만 세도록 앞의 적용 호출까지 함께 본다.
  const calls = [...SOURCE.matchAll(/applySiteChromeHeader\(header,chrome\);ensureAccountingNoticeMenu\(header,chrome\)/g)];
  assert.equal(calls.length, 2, '두 분기 모두 설정이 해결된 뒤 함께 불러야 한다');
  assert.equal((SOURCE.match(/ensureAccountingNoticeMenu\(header\)/g) || []).length, 0);
  assert.match(SOURCE, /chrome\?\.header\?\.accountingNotice!==true\)return/, '엄격한 켜짐 확인');
});

test('공용 헤더 모듈 버전이 올랐고 푸터 모듈은 그대로다', () => {
  // 공용 모듈이 바뀌면 버전을 올려야 하고, 그 핀이 캐시 무효화 규율이다.
  assert.match(SOURCE, /const VERSION=8/);
  const footer = fs.readFileSync(new URL('../shell/user-ui-footer.js', import.meta.url), 'utf8');
  assert.match(footer, /const VERSION=7/, '바뀌지 않은 모듈의 버전을 올려서는 안 된다');
});
