import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root,'education/pizza-experience/index.html'),'utf8');
const js = readFileSync(resolve(root,'education/pizza-experience/app.js'),'utf8');
const css = readFileSync(resolve(root,'education/pizza-experience/styles.css'),'utf8');
const home = readFileSync(resolve(root,'education/index.html'),'utf8');

test('public, single-page classroom is linked from education home', () => {
  assert.match(home, /https:\/\/ekodi\.kr\/edu\/pizza-experience\//);
  assert.match(html, /https:\/\/ekodi\.kr\/edu\/pizza-experience\//);
  assert.match(html, /data-ekodi-ui="USER"/);
  assert.match(html, /id="lesson-stage"/);
  assert.match(html, /id="lesson-plan"/);
  assert.match(html, /id="safety-prep"/);
  assert.match(html, /id="lesson-takeaway"/);
  assert.match(html, /<script type="module" src="\.\/app\.js/);
});

test('70-minute November 5 lesson has complete eight-step sequence', () => {
  assert.match(html, /2026\. 11\. 5\./);
  assert.match(html, /09:20–09:25/);
  assert.match(html, /09:45–10:05/);
  assert.match(html, /10:25–10:30/);
  assert.equal((html.match(/<article(?: class="featured")?><time>/g) || []).length,8);
  assert.match(html, /15명/);
  assert.match(html, /5명 × 3모둠/);
});

test('14 kid-friendly scenes offer quiz, toppings, instructor notes and timer', () => {
  assert.equal((js.match(/notes:'/g) || []).length,14);
  assert.match(js,/quiz:/);
  assert.match(js,/builder:true/);
  assert.match(js,/data-topping/);
  assert.match(js,/setInterval\(tick,250\)/);
  assert.match(html,/id="timerDisplay"/);
  assert.match(html,/id="instructorNotes"/);
  assert.match(js,/requestFullscreen/);
});

test('safety, privacy and responsive layout are explicit', () => {
  assert.match(html,/알레르기/);
  assert.match(html,/오븐과 뜨거운 팬은 어른만/);
  assert.match(html,/개인정보는 저장하지 않습니다/);
  assert.doesNotMatch(js,/(?:localStorage|sessionStorage|fetch\(|XMLHttpRequest)/);
  assert.match(css,/@media\(max-width:980px\)/);
  assert.match(css,/@media\(max-width:690px\)/);
  assert.match(css,/@media\(max-width:420px\)/);
  assert.doesNotMatch(css,/@import/);
});

test('strict production CSP supports quiz feedback and progress without inline style mutation', () => {
  assert.doesNotMatch(js,/\.style\./);
  assert.match(js,/setAttribute\('aria-valuenow'/);
  assert.match(js,/classList\.toggle\('is-incorrect'/);
  assert.match(css,/#progressBar\[aria-valuenow="14"\] #progressFill\{width:100\.0000%\}/);
  assert.match(css,/\.answer-feedback\.is-incorrect\{color:/);
});

test('short copy keeps 14 scenes, safety checklist and complete teaching sequence', () => {
  assert.match(html, /보고 · 만들고 · 나눠요!/);
  assert.match(html, /id="pizza-videos"/);
  assert.match(html, /체험 전에 꼭 확인하세요/);
  assert.match(js, /도우 → 소스 → 치즈 → 토핑/);
  assert.equal((js.match(/notes:'/g) || []).length,14);
  assert.equal((html.match(/<article(?: class="featured")?><time>/g) || []).length,8);
});

test('video recommendations use actual external source links without autoplay or embed', () => {
  assert.equal((html.match(/data-pizza-video/g) || []).length,2);
  assert.match(html, /youtube\.com\/watch\?v=u-EbLZDZ9d4/);
  assert.match(html, /youtube\.com\/watch\?v=Guhd6XAEtsg/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /<iframe/);
});

test('copyright-safe original audio is opt-in and supports play, stop, volume, and video handoff', () => {
  const audioPath=resolve(root,'education/pizza-experience/pizza-playtime.mp3');
  const original=readFileSync(audioPath);
  assert.ok(original.length>40000 && original.length<800000,'audio size within web budget');
  assert.match(original.subarray(0,4).toString('latin1'), /^(ID3|ÿû|ÿó)/);
  assert.match(html, /id="pizzaMusic" src="\.\/pizza-playtime\.mp3" preload="none" loop/);
  assert.equal((html.match(/data-music-toggle/g) || []).length,2);
  assert.doesNotMatch(html, /<audio[^>]*\sautoplay/);
  assert.match(js, /await audio\.play\(\)/);
  assert.match(js, /audio\.pause\(\)/);
  assert.match(js, /audio\.currentTime=0/);
  assert.match(js, /visibilitychange/);
  assert.match(js, /\[data-pizza-video\]/);
  assert.match(js, /audio\.volume=Number\(volume\.value\)\/100/);
  assert.match(css, /\.music-dock/);
  assert.match(css, /\.media-section/);
});
