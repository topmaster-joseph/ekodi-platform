import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDevotionShareMessage, formatDevotionSectionShareMessage } from '../bible/devotion-share-audio.js';

const date = '2026-11-10';
const url = 'https://ekodi.kr/ekodimission/devotion?date=2026-11-10#poem';

test('devotional share has a common title with no label prefixes', () => {
  const result = formatDevotionShareMessage({
    date, title: '에코디언의 묵상나눔 · 로마서 12:1', excerpt: '그대로 살아냅니다', url,
  });
  assert.equal(result.split('\n')[1], '에코디언의 묵상나눔');
  assert.match(result, /로마서 12:1/);
  assert.match(result, /그대로 살아냅니다/);
  assert.ok(result.endsWith(url));
  assert.doesNotMatch(result, /(?:일자|제목|내용|링크):/);
});

test('poem share preserves multiline content without redundant section labels', () => {
  const result = formatDevotionSectionShareMessage({
    date, title: '묵상 시 · 그대로', passage: '고린도전서 7:17-28', content: '다른 곳에 가야\n다른 사람이 되어야', url,
  });
  assert.match(result, /^에코디언의 묵상나눔\n/);
  assert.match(result, /\n고린도전서 7:17-28\n〈그대로〉 \(묵상시\)\n다른 곳에 가야\n다른 사람이 되어야\n/);
  assert.ok(result.endsWith(url));
  assert.doesNotMatch(result, /(?:일자|제목|내용|링크):|묵상 시 ·|묵상 노래 ·/);
});

// REISSUE-DEVOTION-SHARE-LINES-001: 후렴을 슬래시 연결에서 줄바꿈으로 바꾸면서
// 이미 '후렴:' 으로 저장된 본문을 위한 정규화 경로가 생겼다. 그 경로에는 테스트가
// 없었고(변이로 지웠을 때 아무것도 실패하지 않았다), 저장된 묵상 데이터가 옛 표기로
// 들어오면 조용히 한 줄로 뭉쳐 나간다. 두 종류의 콜론을 모두 고정한다.
test('이미 저장된 "후렴:" 표기도 줄바꿈으로 펼쳐진다', () => {
  for (const colon of [':', '：']) {
    const result = formatDevotionSectionShareMessage({
      date, title: '묵상 노래 · 그대로', passage: '로마서 12:1',
      content: `첫 절\n둘째 절\n후렴${colon} 후렴 하나\n후렴 둘`, url,
    });
    assert.match(result, /\n후렴\n후렴 하나\n후렴 둘/u,
      `"후렴${colon}" 는 제목 줄로 펼쳐져야 한다`);
    assert.doesNotMatch(result, new RegExp(`후렴${colon === ':' ? ':' : '：'}`, 'u'),
      '옛 콜론 표기가 공유 메시지에 남아서는 안 된다');
  }
});

test('정규화는 줄 시작의 "후렴:" 만 바꾼다', () => {
  // 줄 가운데의 '후렴:' 은 후렴 표지가 아니라 산문이다. 전역 치환으로 바꾸면
  // 가사 한 줄이 둘로 쪼개진다.
  const result = formatDevotionSectionShareMessage({
    date, title: '묵상 노래 · 그대로', passage: '로마서 12:1',
    content: '그 노래 후렴: 반복되는 말\n후렴구를 적는다', url,
  });
  assert.match(result, /그 노래 후렴: 반복되는 말\n후렴구를 적는다/u,
    '줄 가운데의 콜론 표기는 그대로 남아야 한다');
  assert.doesNotMatch(result, /노래 후렴\n반복되는 말/u, '줄이 쪼개져서는 안 된다');
});

test('sharing rejects external URL', () => {
  assert.throws(() => formatDevotionSectionShareMessage({
    date, title: '묵상 시 · 그대로', content: '본문', url: 'https://evil.example/poem',
  }), /invalid_devotion_url/);
});
