import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('mission mobile homepage shows daily devotion and avoids duplicate header rows',async()=>{
  const [home,siteCss,shellCss]=await Promise.all([
    readFile(new URL('../space/ekodimission.page',import.meta.url),'utf8'),
    readFile(new URL('../space/ekodimission.css',import.meta.url),'utf8'),
    readFile(new URL('../space/ekodimission-shell.css',import.meta.url),'utf8'),
  ]);
  assert.ok(home.includes('class="mission-home"'));
  assert.ok(home.includes('class="mission-home-devotion"'));
  assert.ok(home.includes('오늘의 매일 묵상'));
  assert.ok(home.includes('href="/ekodimission/devotion">오늘 묵상 보기'));
  assert.ok(siteCss.includes('.mission-home .hero-split{'));
  assert.ok(siteCss.includes('min-height:0!important'));
  assert.ok(siteCss.includes('.mission-home .hero .actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'));
  assert.ok(shellCss.includes('flex-wrap:nowrap!important'));
  assert.ok(shellCss.includes('.mission-language[hidden]{display:none!important}'));
});
