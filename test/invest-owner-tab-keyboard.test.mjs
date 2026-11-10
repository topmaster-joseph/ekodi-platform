// INVEST-OWNER-TAB-HOME-END-001
//
// 마이투자 화면에는 탭 두 줄이 있다. 하위의 #detailTabs는 ArrowLeft·ArrowRight와
// Home·End를 모두 받고, 상단의 #ownerTabs는 Arrow만 받았다. 키보드로만 쓰는
// 사람에게는 같은 화면에서 같은 키가 한 줄에서는 듣고 한 줄에서는 먹히지 않는
// 불일치로 나타난다. 두 핸들러를 같은 키 집합으로 맞춘다.
//
// 더해서 #ownerTabs에는 #detailTabs가 가진 빈 목록 보호(`if(!list.length)return`)가
// 없었다. 탭이 아직 그려지지 않은 순간에 방향키가 들어오면 list[NaN]이 undefined가
// 되어 n.dataset에서 던진다. 측정된 사고는 아니고, 하위 탭에 이미 있는 보호를
// 상단 탭에도 두는 것이다.
//
// Arrow 동작은 바꾸지 않는다. 기존 식 (i+(Right?1:len-1))%len 과 새 식
// (i+shift+len)%len 은 i=-1(선택 없음)인 경우까지 같은 값을 낸다. 아래 테스트가
// 그 동치를 직접 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { investMyRoute } from '../invest-my-workspace.js';

const script = await (async () => {
  const response = await investMyRoute(new Request('https://ekodi.kr/invest/my/app.js'), {});
  assert.equal(response.status, 200);
  return response.text();
})();

// 저장소의 기존 방식: 서빙된 스크립트에서 해당 핸들러만 떼어 VM에서 실제로 돌린다.
function handler(tablist) {
  const anchor = `el('${tablist}').addEventListener('keydown',`;
  const start = script.indexOf(anchor);
  assert.ok(start > 0, `${tablist} keydown handler must exist in the served script`);
  const bodyStart = start + anchor.length;
  const end = script.indexOf('\n', bodyStart);
  const source = script.slice(bodyStart, end).replace(/\);\s*$/, '');
  return source;
}

function run(source, { tabs, selected, key }) {
  const calls = [];
  let prevented = false;
  const nodes = tabs.map(tab => ({
    dataset: { tab },
    getAttribute: name => (name === 'aria-selected' ? String(tab === selected) : null),
    focus() {},
  }));
  // 선택자를 무시하는 스텁은 "다른 탭 줄을 조회한다"는 결함을 보지 못한다.
  // 기대한 선택자에만 노드를 돌려주고, 무엇을 조회했는지 기록한다.
  const queried = [];
  const context = {
    document: {
      querySelectorAll(selector) {
        queried.push(selector);
        return selector === '#ownerTabs [data-tab]' ? nodes : [];
      },
    },
    showTab: (tab, options) => calls.push({ tab, options }),
  };
  const fn = vm.runInNewContext(`(${source})`, context);
  fn({ key, preventDefault() { prevented = true; } });
  return { calls, prevented, queried };
}

const TABS = ['summary', 'analysis', 'broker', 'live', 'report'];
const OWNER = handler('ownerTabs');

test('두 탭 줄이 같은 키 집합을 받는다', () => {
  const detail = handler('detailTabs');
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
    assert.ok(OWNER.includes(`'${key}'`), `상단 탭이 ${key}를 받아야 한다`);
    assert.ok(detail.includes(`'${key}'`), `상세 탭이 ${key}를 받아야 한다`);
  }
});

test('상단 탭 줄만 조회한다 — 다른 탭 줄이 아니다', () => {
  // 선택자를 잘못 짚으면 상세 탭을 움직이거나 아무것도 못 찾는다.
  const { queried, calls } = run(OWNER, { tabs: TABS, selected: 'summary', key: 'End' });
  assert.deepEqual(queried, ['#ownerTabs [data-tab]'], '상단 탭 줄을 정확히 조회해야 한다');
  assert.deepEqual(calls.map(call => call.tab), ['report'], '그 줄의 탭이 선택되어야 한다');
});

test('Home은 첫 탭, End는 마지막 탭으로 간다', () => {
  const home = run(OWNER, { tabs: TABS, selected: 'broker', key: 'Home' });
  assert.deepEqual(home.calls.map(call => call.tab), ['summary']);
  assert.equal(home.prevented, true, '브라우저의 문서 스크롤을 막아야 한다');

  const end = run(OWNER, { tabs: TABS, selected: 'broker', key: 'End' });
  assert.deepEqual(end.calls.map(call => call.tab), ['report']);
  assert.equal(end.prevented, true);
});

test('Home·End는 이미 그 끝에 있어도 같은 탭을 가리킨다', () => {
  assert.deepEqual(run(OWNER, { tabs: TABS, selected: 'summary', key: 'Home' }).calls[0].tab, 'summary');
  assert.deepEqual(run(OWNER, { tabs: TABS, selected: 'report', key: 'End' }).calls[0].tab, 'report');
});

test('방향키 동작은 바뀌지 않는다 — 감싸기까지 그대로', () => {
  // 기존 식과의 동치를 값으로 확인한다.
  const previous = (i, key, len) => (i + (key === 'ArrowRight' ? 1 : len - 1)) % len;
  for (const selected of [...TABS, '없음']) {
    const i = TABS.indexOf(selected);
    for (const key of ['ArrowRight', 'ArrowLeft']) {
      const { calls } = run(OWNER, { tabs: TABS, selected, key });
      assert.deepEqual(calls.map(call => call.tab), [TABS[previous(i, key, TABS.length)]],
        `${selected} + ${key} 는 이전 구현과 같은 탭이어야 한다`);
    }
  }
});

test('선택을 옮길 때 URL과 초점을 함께 가져간다', () => {
  for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
    const { calls } = run(OWNER, { tabs: TABS, selected: 'analysis', key });
    assert.equal(calls.length, 1);
    // VM 컨텍스트에서 만들어진 객체라 프로토타입이 달라 깊은 비교가 성립하지 않는다.
    assert.equal(calls[0].options.focus, true, '탭을 옮기면 초점이 따라가야 한다');
    assert.equal(calls[0].options.updateUrl, true, '탭을 옮기면 주소가 따라가야 한다');
    assert.deepEqual(Object.keys(calls[0].options).sort(), ['focus', 'updateUrl'],
      '옮기는 데 필요한 것만 전달한다');
  }
});

test('다루지 않는 키는 그대로 흘려보낸다', () => {
  for (const key of ['Tab', 'Enter', ' ', 'a', 'ArrowUp', 'PageDown', 'Escape', undefined]) {
    const { calls, prevented } = run(OWNER, { tabs: TABS, selected: 'summary', key });
    assert.deepEqual(calls, [], `${String(key)} 는 탭을 옮기지 않아야 한다`);
    assert.equal(prevented, false, `${String(key)} 의 기본 동작을 막지 않아야 한다`);
  }
});

test('탭이 아직 없을 때 던지지 않는다', () => {
  // 상세 탭에 이미 있던 보호를 상단 탭에도 둔다.
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
    const { calls, prevented } = run(OWNER, { tabs: [], selected: '없음', key });
    assert.deepEqual(calls, []);
    assert.equal(prevented, false, '할 일이 없으면 기본 동작도 막지 않는다');
  }
  assert.ok(OWNER.includes('if(!list.length)return'), '빈 목록 보호가 코드에 남아 있어야 한다');
});

test('탭이 하나뿐이면 어느 키로도 그 하나를 가리킨다', () => {
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
    const { calls } = run(OWNER, { tabs: ['summary'], selected: 'summary', key });
    assert.deepEqual(calls.map(call => call.tab), ['summary']);
  }
});
