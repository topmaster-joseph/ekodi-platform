import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spokenScriptureReference,devotionSpeechSegments} from '../bible/devotion-share-audio.js';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('Mission devotion uses exact Mission home header/footer public shell, no forced article-column width',()=>{
  const devotion=read('space/ekodimission-devotion.page');
  const homepage=read('space/ekodimission.page');
  const chrome=read('space/ekodimission-shell.css');
  const shell=read('space/ekodimission-shell.js');
  const htmlTag=tag=>new RegExp('<'+tag+'\\b[^>]*class="(?:mission-site-header|site-footer)"[\\s\\S]*?<\\/'+tag+'>');
  const homeHeader=homepage.match(htmlTag('header'))?.[0]||'';
  const devotionHeader=devotion.match(htmlTag('header'))?.[0]||'';
  // 모든 하위 화면은 홈과 같은 헤더(같은 CI 표식 포함)를 쓴다.
  assert.equal(devotionHeader,homeHeader);
  assert.match(homeHeader,/data-mission-ci="open-table"/);
  assert.match(devotion,/<header class="mission-site-header">/);
  assert.match(homepage,/<footer class="site-footer">/);
  assert.match(devotion,/<footer class="site-footer">/);
  assert.match(devotion,/<main class="subpage" data-mission-devotion>/);
  assert.match(devotion,/<link rel="stylesheet" href="\/ekodimission\/assets\/shell.css">/);
  assert.match(devotion,/<script src="\/ekodimission\/assets\/shell.js" defer><\/script>/);
  assert.match(shell,/function normalizeMissionFooter\(\)/);
  assert.match(shell,/if\(meta\)meta\.textContent='EKODI MISSION/);
  assert.match(chrome,/main\[data-mission-devotion\]\{\s*width:100%;max-width:840px/);
  assert.doesNotMatch(chrome,/body:has\(main\[data-mission-devotion\]\) \.mission-site-header,\s*body:has\(main\[data-mission-devotion\]\) \.site-footer,\s*main\[data-mission-devotion\]/);
  assert.doesNotMatch(chrome,/body:has\(main\[data-mission-devotion\]\) \.site-footer\{padding-top/);
  assert.match(chrome,/\.mission-site-header,main,\.site-footer\{width:100%;max-width:var\(--mission-max\)/);
});

test('three primary narration controls use one explicit grid row; advanced controls follow',()=>{
  const css=read('bible/devotion.css');
  const speech=read('bible/devotion-speech-ui.js');
  assert.match(css,/DEVOTION-VOICE-ONE-ROW-001/);
  assert.match(css,/\.dv-speech-tools\{\s*display:grid;\s*grid-template-columns:minmax\(0,1\.4fr\) minmax\(0,1fr\) minmax\(0,1fr\)/);
  for(const selector of ['.dv-speech-gender','.dv-speech-btn[data-speech-action="play"]','.dv-speech-more']){
    const index=css.indexOf('.ekodi-devotion .dv-speech-tools '+selector,css.indexOf('DEVOTION-VOICE-ONE-ROW-001'));
    assert.ok(index>0,'missing '+selector);
    assert.match(css.slice(index,index+350),/grid-row:1/,'not first-row '+selector);
  }
  assert.match(css,/@media\(max-width:520px\)/);
  assert.match(css,/grid-template-columns:minmax\(0,1\.43fr\) minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(speech,/row\.append\(play, pause, repeat, stopButton, speedLabel, status, genderLabel, voiceLabel, engineLabel, moreSettings\)/);
  assert.match(speech,/moreSettings\.setAttribute\('aria-expanded','false'\)/);
  assert.match(speech,/row\.dataset\.advanced='false'/);
});

test('spoken Scripture references use natural Korean chapter and verse phrasing',()=>{
  const cases=[
    ['고린도전서 4:14-21','고린도전서 4장 14절부터 21절'],
    ['고린도전서 4:14–21','고린도전서 4장 14절부터 21절'],
    ['고린도전서 4:14—21','고린도전서 4장 14절부터 21절'],
    ['요한복음 3:16','요한복음 3장 16절'],
    ['시편 23:1~6','시편 23장 1절부터 6절'],
    ['창세기 1:1-2:3','창세기 1장 1절부터 2장 3절'],
    ['고린도후서 5:17','고린도후서 5장 17절'],
    ['로마서 8:1-4','로마서 8장 1절부터 4절'],
  ];
  for(const [input,want] of cases)assert.equal(spokenScriptureReference(input),want);
  assert.equal(spokenScriptureReference('고린도전서 4장 14절부터 21절'),'고린도전서 4장 14절부터 21절');
  const segments=devotionSpeechSegments({
    found:true,passage:'고린도전서 4:14-21',
    activities:{theme:'말씀을 살아내기',prayer:'주님, 깨닫게 하소서.'},
    scripture:[{ok:true,verses:[{verse:14,text:'사랑하는 자녀 같이 권하려 하는 것이라'}]}]
  });
  assert.ok(segments[0].includes('고린도전서 4장 14절부터 21절'));
  assert.ok(segments.includes('14절. 사랑하는 자녀 같이 권하려 하는 것이라'));
  assert.ok(segments.some(x=>x.includes('주님, 깨닫게 하소서.')));
  assert.ok(!segments[0].includes('4:14-21'));
  assert.deepEqual(devotionSpeechSegments({found:false,passage:'요한복음 3:16'}),[]);
});
