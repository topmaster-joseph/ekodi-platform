import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const home = read('index.html');
const base = read('church-i18n.js');
const ext = read('church-i18n-extended.js');

// Strings rendered on the homepage that the production nine-language check requires.
const REQUIRED = [
  '함께하기',
  '기도·후원·협력으로 함께하기 →',
  '실시간 방송 시청', '시청 종료', '실시간 방송 준비', '별도 화면에서 시청',
  '에코디교회 실시간 방송 영상', '전체화면', '전체화면 종료',
  '공개 방송은 로그인 없이 볼 수 있습니다.',
  '방송 시청을 누르면 이곳에서 바로 재생됩니다.',
  '실시간 방송을 연결하고 있습니다. 방송 중이 아니면 대기 안내가 표시됩니다.',
  '전체화면이 지원되지 않습니다. 별도 화면에서 시청할 수 있습니다.',
  '전체화면 전환이 제한되었습니다. 별도 화면에서 시청할 수 있습니다.',
];

for (const ko of REQUIRED) {
  test(`translated in all church locales: ${ko}`, () => {
    assert.ok(base.includes(`'${ko}':{en:`), `missing en/zh/ja: ${ko}`);
    assert.ok(ext.includes(`add('${ko}',`), `missing my/kac/vi/mn/id: ${ko}`);
  });
}

test('receipt help stays an exact translatable text node', () => {
  assert.match(home, /<small class="giving-receipt-help">영수증 발행 문의 010-3501-8542<\/small>/);
  assert.match(home, /<a class="giving-together-link" href="\/ekodichurch\/together\/">기도·후원·협력으로 함께하기 →<\/a>/);
});
