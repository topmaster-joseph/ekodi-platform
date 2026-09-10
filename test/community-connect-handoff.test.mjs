import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [community, connect, css] = await Promise.all([
  readFile(new URL('../community/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../community/connect/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../community/connect/styles.css', import.meta.url), 'utf8'),
]);

test('Community people hand off to Connect without putting a person id in the URL', () => {
  assert.match(community, /ekodi\.connect\.focus/);
  assert.match(community, /user_id:p\.user_id/);
  assert.match(community, /Connect에서 보기/);
  assert.match(community, /location\.assign\('\/connect\/'\)/);
  assert.doesNotMatch(community, /searchParams\.set\(['"](?:focus|user_id|target_user_id)/);
});

test('Connect honors a short-lived Community focus only inside consent-filtered recommendations', () => {
  assert.match(connect, /const FOCUS_KEY='ekodi\.connect\.focus'/);
  assert.match(connect, /expires_at/);
  assert.match(connect, /focusIndex=state\.focus\?people\.findIndex/);
  assert.match(connect, /이 목적의 공개 조건 확인됨/);
  assert.match(connect, /조건을 우회하거나 추측하지 않습니다/);
  assert.match(connect, /clearFocus\(p\.user_id\)/);
  assert.match(css, /\.person-card\.focus-card/);
});
