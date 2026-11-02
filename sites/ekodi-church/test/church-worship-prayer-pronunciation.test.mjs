import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = file => readFileSync(new URL('../worship/2026-10-11/prayer/' + file,import.meta.url),'utf8');
const html=read('index.html');
const js=read('prayer.js');
const css=read('prayer.css');

test('all five slide languages have exact locale-specific prayer readings',()=>{
  for (const [lang,locale,needle] of [
    ['ko','ko-KR','하늘에 계신 우리 아버지'],
    ['en','en-US','Our Father which art in heaven'],
    ['zh','zh-CN','我们在天上的父'],
    ['ja','ja-JP','天にまします我らの父よ'],
    ['vi','vi-VN','Lạy Cha chúng con ở trên trời']
  ]) {
    assert.match(js,new RegExp(locale.replace('-','-')));
    assert.ok(js.includes(needle));
    assert.ok(js.includes(lang + ': {'));
  }
  assert.match(html,/lang="ko"/);
  assert.match(html,/language-tabs/);
  assert.match(html,/prayer-lines/);
});

test('pronunciation playback offers human-initiated speech, controlled pace, pause, stop, and phrase repeat',()=>{
  new Function(js);
  assert.match(js,/SpeechSynthesisUtterance/);
  assert.match(js,/getVoices\(\)/);
  assert.match(js,/currentVoice/);
  assert.match(js,/\.rate = Number\(rate.value\)/);
  assert.match(js,/synth\.pause\(\)/);
  assert.match(js,/synth\.resume\(\)/);
  assert.match(js,/synth\.cancel\(\)/);
  assert.match(js,/indices\.flatMap\(index => twice \? \[index,index\]/);
  assert.match(js,/utterance\.onend/);
  assert.match(js,/utterance\.onerror/);
  assert.match(css,/\[data-active=true\]/);
  assert.match(html,/id="rate"/);
  assert.match(html,/id="repeat"/);
});

test('no autoplay or external text transmission; missing installed voice blocks incorrect-language playback',()=>{
  assert.match(js,/if \(!currentVoice \|\| !synth\)/);
  assert.match(js,/start\(indices\)/);
  assert.doesNotMatch(js,/fetch\(|XMLHttpRequest|MediaRecorder|WebSocket|apiKey|streamKey/i);
  assert.ok(!html.includes('<script>') && !html.includes('onclick='));
  assert.match(html,/prayer\.js" defer/);
});

test('public Sunday worship page links to pronunciation player',()=>{
  const worship=readFileSync(new URL('../worship/2026-10-11/index.html',import.meta.url),'utf8');
  assert.match(worship,/\.\/prayer\/\?lang=ko/);
  assert.match(worship,/주기도문 5개 언어 발음 듣기/);
});