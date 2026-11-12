import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Mission independently displays hospitality declaration without changing preview, attendance or privacy',()=>{
  const html=load('space/ekodimission.page'),css=load('space/ekodimission-shell.css');
  assert.match(html,/data-ekodi-mission="mission"/);
  assert.match(html,/우리는 식탁의 환대와 연대로 이웃의 존엄을 지키며, 삶의 현장에서 복음의 사랑과 회복을 나눈다\./);
  assert.match(html,/noindex,nofollow,noarchive/);
  assert.match(html,/PREVIEW/);
  assert.match(html,/이번 주 참석 의사는 공개되지 않습니다/);
  assert.match(html,/전화번호 등 개인정보를 적지 마세요/);
  assert.match(html,/에코디선교회/);
  assert.match(css,/\.mission-home \.mission-purpose-statement/);
  assert.equal((html.match(/data-ekodi-mission="mission"/g)||[]).length,1);
});
