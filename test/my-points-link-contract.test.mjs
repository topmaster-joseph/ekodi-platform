import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const home=fs.readFileSync(new URL('../my/index.html',import.meta.url),'utf8');
const points=fs.readFileSync(new URL('../my/points/index.html',import.meta.url),'utf8');
test('My EKODI activity tab links to the personal points page',()=>{
  assert.match(home, /data-my-tab-section="activity"[\s\S]*?<a class="secondary" href="\/my\/points\/">내 활동포인트 보기<\/a>/);
  assert.match(points, /id="balanceView" hidden/);
  assert.match(points, /id="loginLink"[^>]*hidden/);
  assert.match(points, /name="robots" content="noindex,nofollow,noarchive"/);
});
