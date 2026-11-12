// PIN-PLAYWRIGHT-RUNNER-IMAGE-001
//
// 측정 2026-11-12:
//
//   Install isolated first-party Chromium
//   Failed to install browsers
//   Error: ERROR: Playwright does not support chromium on ubuntu26.04-x64
//
// GitHub 이 ubuntu-latest 를 26.04 로 교체하는 중이고, 고정된 playwright@1.55.0
// 은 그 이미지에서 chromium 을 설치하지 못한다. 같은 워크플로가 11:38~11:41 에는
// 통과하고 11:41(codex PR), 11:43(이 세션의 PR)에 실패했다 — 새 이미지에 배정된
// 작업만 깨지므로 간헐적이고, 롤아웃이 끝나면 전부 깨진다.
//
// EKODI 의 운영 검증이 이 레인들에 걸려 있고 검증 실패는 배포를 막는다. 즉
// 아무것도 배포되지 않는 상태로 간다. 재실행 두 번으로도 풀리지 않았다.
//
// 그래서 브라우저를 설치하는 워크플로는 러너 이미지를 명시한다. 저장소에 이미
// 그 관례가 있었다(ekodi-background-browser-worker, verify-ekodi-mall-header-native).
//
// 이것은 Playwright 상향이 아니라 알려진 환경으로의 복귀다. 상향은 32개 레인의
// 브라우저 자동화 동작을 함께 바꾸므로 따로 평가할 일이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DIR = new URL('../.github/workflows/', import.meta.url);
const files = fs.readdirSync(DIR).filter(name => name.endsWith('.yml') || name.endsWith('.yaml'));
const read = name => fs.readFileSync(new URL(name, DIR), 'utf8');

const browserWorkflows = files.filter(name => /playwright install|mmdc |puppeteer/.test(read(name)));

test('브라우저를 설치하는 워크플로가 하나 이상 있다', () => {
  // 이 목록이 비면 아래 단정들이 아무것도 검사하지 않는다.
  assert.ok(browserWorkflows.length >= 30, `브라우저 워크플로 ${browserWorkflows.length}개`);
});

test('브라우저를 설치하는 워크플로는 ubuntu-latest 를 쓰지 않는다', () => {
  const offenders = browserWorkflows.filter(name => /runs-on:\s*ubuntu-latest/.test(read(name)));
  assert.deepEqual(offenders, [],
    'ubuntu-latest 는 GitHub 이 교체하는 별칭이다. 브라우저 설치는 이미지가 바뀌면 깨진다');
});

test('고정된 이미지는 실제로 존재하는 버전이다', () => {
  // 오타로 없는 이미지를 적으면 작업이 아예 시작되지 않는다.
  const allowed = new Set(['ubuntu-24.04', 'ubuntu-22.04', 'ubuntu-20.04']);
  for (const name of browserWorkflows) {
    for (const match of read(name).matchAll(/runs-on:\s*(ubuntu-[0-9.]+)/g)) {
      assert.ok(allowed.has(match[1]), `${name}: 알 수 없는 러너 이미지 ${match[1]}`);
    }
  }
});

test('한 워크플로 안에서 러너 이미지가 갈리지 않는다', () => {
  // 같은 레인의 작업들이 서로 다른 이미지에서 돌면 재현되지 않는 차이가 생긴다.
  for (const name of browserWorkflows) {
    const images = [...read(name).matchAll(/runs-on:\s*(ubuntu-[0-9.a-z]+)/g)].map(m => m[1]);
    const distinct = [...new Set(images)];
    assert.ok(distinct.length <= 1, `${name}: 이미지가 섞였다 — ${distinct.join(', ')}`);
  }
});

test('Playwright 버전은 고정된 채로 둔다', () => {
  // 이 변경은 이미지 복귀이고 상향이 아니다. 버전까지 움직이면 32개 레인의
  // 브라우저 동작이 함께 바뀌어, 무엇이 무엇을 고쳤는지 알 수 없게 된다.
  // 범위 표기(^1.55, ~1.55, latest, *)까지 함께 수집해야 한다. 숫자로 시작하는
  // 것만 모으면 범위로 바꿔치기한 변경을 단정이 보지도 못한다.
  const specs = files.flatMap(name => [...read(name).matchAll(/playwright(?:-core)?@(\S+)/g)]
    .map(m => ({ name, spec: m[1].replace(/["',)]+$/, '') })));
  assert.ok(specs.length > 0, 'playwright 버전 고정이 있어야 한다');
  for (const { name, spec } of specs) {
    assert.match(spec, /^\d+\.\d+\.\d+$/,
      `${name}: 정확한 버전이어야 한다 — 범위나 별칭은 이미지 교체와 같은 종류의 사고를 만든다: ${spec}`);
  }
});

test('이미 고정돼 있던 두 워크플로는 그대로다', () => {
  // 이 둘은 이 함정을 피해 있었다. 관례의 출처이므로 바뀌지 않아야 한다.
  for (const name of ['ekodi-background-browser-worker.yml', 'verify-ekodi-mall-header-native.yml']) {
    assert.ok(files.includes(name), `${name} 가 있어야 한다`);
    assert.match(read(name), /runs-on:\s*ubuntu-24\.04/);
  }
});

test('이 가드는 워크플로 디렉터리를 실제로 읽는다', () => {
  // 목록을 테스트에 적어 두면 새로 추가되는 워크플로가 검사에서 빠진다.
  const source = fs.readFileSync(new URL('./playwright-runner-image-pinned.test.mjs', import.meta.url), 'utf8');
  assert.match(source, /fs\.readdirSync\(DIR\)/, '디렉터리를 읽어 목록을 만들어야 한다');
  assert.ok(files.length > browserWorkflows.length, '브라우저를 쓰지 않는 워크플로도 함께 읽혀야 한다');
  assert.ok(path.isAbsolute(new URL(files[0], DIR).pathname));
});
