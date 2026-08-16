import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const js = readFileSync(new URL('../marketing-ai-admin.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../marketing-ai-admin.css', import.meta.url), 'utf8');

test('MarketingAI admin is an admin-only console with a separate user entry', () => {
  assert.match(js, /button\.dataset\.section = 'marketing-ai'/);
  assert.match(js, /Marketing AI 운영센터/);
  assert.ok(js.includes('href="${LIVE}" target="_blank"'));
  assert.match(js, /사용자 페이지 ↗/);
  assert.match(js, /사용자 사이트는 관리자 화면 안에 임베드하지 않습니다/);
  assert.doesNotMatch(js, /marketingAiAdminFrame/);
  assert.doesNotMatch(js, /<iframe/i);
  assert.doesNotMatch(css, /marketing-ai-frame-/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) 300px/);
});
