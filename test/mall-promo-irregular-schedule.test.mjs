import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { irregularSlotMinute, kstParts, fallbackContent } from '../mall-promotion-automation.js';

test('irregular slots stay inside 09:00-21:30 KST and vary by day and channel', () => {
  const seen = new Set();
  for (let d = 1; d <= 28; d += 1) {
    const day = `2026-11-${String(d).padStart(2, '0')}`;
    for (const p of ['facebook', 'instagram', 'threads']) {
      const m = irregularSlotMinute(day, p);
      assert.ok(m >= 540 && m < 1290, `${day} ${p} ${m}`);
      seen.add(m);
    }
  }
  assert.ok(seen.size > 60, 'times must not repeat on a fixed schedule');
  assert.equal(irregularSlotMinute('2026-11-01', 'facebook'), irregularSlotMinute('2026-11-01', 'facebook'));
});

test('kstParts exposes minute of day', () => {
  assert.equal(kstParts(new Date('2026-10-25T03:30:00Z')).minute, 12 * 60 + 30);
});

test('every generated post starts with the official Coupang Partners disclosure', async () => {
  for (const p of ['facebook', 'instagram', 'threads']) {
    const c = fallbackContent({ product_name: '테스트 상품', category: '디지털' }, p);
    assert.ok(c.caption.startsWith('이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.'));
  }
  const src = await readFile(new URL('../mall-promotion-automation.js', import.meta.url), 'utf8');
  assert.match(src, /if\(!force&&kst\.minute<slotMinute\)/);
});
