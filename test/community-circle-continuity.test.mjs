import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../community/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../community/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../community/community-discovery.css', import.meta.url), 'utf8');

test('shared Circle links survive sign-in and focus the exact public circle', () => {
  assert.match(app, /URLSearchParams\(location\.search\)\.get\('circle'\)/);
  assert.match(app, /ekodi\.community\.circle-focus/);
  assert.match(app, /expires_at:Date\.now\(\)\+30\*60\*1000/);
  assert.match(app, /location\.origin\+'\/\?circle='/);
  assert.match(app, /data-circle-id/);
  assert.match(css, /\.circle-card\.circle-focus/);
});

test('Circle participation is reviewed before the membership write', () => {
  assert.match(page, /id="circleJoinModal"/);
  assert.match(page, /PARTICIPATION REVIEW/);
  assert.match(page, /이 확인 단계에서는 연락처나 추가 개인정보를 보내지 않습니다/);
  assert.match(app, /openCircleJoinReview/);
  assert.match(app, /circleJoinConfirm.*addEventListener\('click',\(\)=>joinCircle\(\)\)/);
  assert.match(app, /\/circles\/'\+circle\.id\+'\/join'/);
  assert.match(app, /body:'\{\}'/);
});

test('Circle review keeps recommendation, visibility, policy and resulting state explicit', () => {
  for (const id of ['circleJoinReason','circleJoinMode','circleJoinPolicy','circleJoinVisibility','circleJoinCapacity','circleJoinStatus']) assert.match(page, new RegExp(`id="${id}"`));
  assert.match(app, /c\.recommendation_reasons\?\.length/);
  assert.match(app, /circleVisibilityLabel\(c\.visibility\)/);
  assert.match(app, /c\.join_policy==='invite'/);
  assert.match(app, /data\.membership\.status==='active'/);
  assert.match(app, /승인 대기/);
});

test('Circle join result persists through recommendation re-ranking', () => {
  assert.match(app, /state\.circles\.find\(item=>String\(item\.id\)===String\(circle\.id\)\)/);
  assert.match(app, /stored\.my_membership=data\.membership/);
  assert.match(app, /stored\.member_count=\(stored\.member_count\|\|0\)\+added/);
});
