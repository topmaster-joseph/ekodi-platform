import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8').replace(/^\uFEFF/,'');

test('immersive portal journey is present and remains synthetic-safe',()=>{
  const html=read('experience/index.html');
  const css=read('experience/styles.css');
  const app=read('experience/app.js');
  for(const value of ['portal-scene','journey-console','journey-progress','room-overlay','IMMERSIVE ROOMS']) assert.ok(html.includes(value));
  for(const value of ['portal-frame','perspective:1000px','prefers-reduced-motion','immersive-room']) assert.ok(css.includes(value));
  assert.match(app,/initStarfield/);
  assert.match(app,/initSceneMotion/);
  assert.match(app,/실제 저장·결제·게시·메시지는 발생하지 않았습니다/);
  assert.match(app,/소스코드 · 저장소 · 내부 API · DB · Worker/);
});

test('immersive experience stays self-contained and read-only by design',()=>{
  const html=read('experience/index.html');
  const app=read('experience/app.js');
  assert.doesNotMatch(html,/https:\/\/(?:unpkg|cdn|jsdelivr|threejs|fonts\.googleapis)/i);
  assert.doesNotMatch(app,/fetch\(['\"]https:\/\//i);
  assert.match(app,/fetch\('\/api\/catalog'/);
});