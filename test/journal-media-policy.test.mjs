import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { approvedJournalPhoto } from '../journal/media-policy.js';

const source = (name) => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('approved journal media is restricted to reviewed, same-origin image assets', () => {
  const valid = approvedJournalPhoto({
    src: '/journal/media/field/meeting-2026.webp',
    alt: '공동체가 원탁에 모여 이야기하는 모습',
    caption: '현장 기록', credit: 'EKODI', rightsStatus: 'verified',
  });
  assert.equal(valid.src, '/journal/media/field/meeting-2026.webp');
  assert.ok(Object.isFrozen(valid));
  for (const src of ['https://example.com/photo.jpg', '//evil.test/p.png', '/journal/media/../private.jpg', '/journal/media/x.svg', '/media/p.jpg', 'data:image/png;base64,AAAA', '/journal/media/a%2fb.jpg']) {
    assert.equal(approvedJournalPhoto({ src, alt: '설명', rightsStatus: 'verified' }), null, src);
  }
  assert.equal(approvedJournalPhoto({ src: '/journal/media/field.jpg', alt: '설명', rightsStatus: 'pending' }), null);
  assert.equal(approvedJournalPhoto({ src: '/journal/media/field.jpg', alt: '', rightsStatus: 'verified' }), null);
});

test('journal UI consumes only approved photographic metadata', () => {
  const publicApp = source('journal/app.js');
  const content = source('journal-content.js');
  assert.match(publicApp, /approvedJournalPhoto/);
  assert.match(content, /approvedJournalPhoto/);
  assert.match(publicApp, /loading="lazy"/);
  assert.match(publicApp, /escapeHtml\(photo.alt\)/);
  assert.match(publicApp, /photoCaption/);
  assert.match(content, /coverPhoto: approvedJournalPhoto/);
});
