import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEVOTION_VERSIONS,isDevotionVersion,officialDevotionPassageUrl,isApprovedOfficialBibleHost} from '../bible/devotion-scripture-versions.js';
import {createDevotionSpeechUI} from '../bible/devotion-speech-ui.js';

const sample={
 found:true,date:'2026-11-04',passage:'고린도전서 4:14-21',
 scripture:[{ok:true,book:{id:'1CO',name:'고린도전서'},chapter:4,verses:[{verse:14,text:'우리의 자녀 같이 권하려 하는 것이라'},{verse:21,text:'사랑과 온유한 마음으로'}]}],
 activities:{keyLine:'오늘의 말씀',prayer:'기도합니다'}
};
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('translation picker offers the requested 3 versions with KRV as the only inline audio copy',()=>{
 assert.deepEqual(DEVOTION_VERSIONS.map(v=>v.label),['개역한글','표준새번역','NIV']);
 assert.deepEqual(DEVOTION_VERSIONS.map(v=>v.id),['KRV1961','SAE','NIV']);
 assert.deepEqual(DEVOTION_VERSIONS.map(v=>v.mode),['local','official-link','official-link']);
 assert.equal(isDevotionVersion('KRV1961'),true);
 assert.equal(isDevotionVersion('SAE'),true);
 assert.equal(isDevotionVersion('NIV'),true);
 assert.equal(isDevotionVersion('javascript:alert(1)'),false);
 assert.equal(officialDevotionPassageUrl(sample,'KRV1961'),null);
});
test('official provider URLs use the actual passage book, chapter and first verse',()=>{
 const sae=officialDevotionPassageUrl(sample,'SAE');
 assert.equal(sae,'https://www.bskorea.or.kr/bible/korbibReadpage.php?book=1co&chap=4&sec=14&version=SAE');
 assert.equal(officialDevotionPassageUrl(sample,'NIV'),'https://www.bible.com/bible/111/1CO.4.niv');
 assert.equal(isApprovedOfficialBibleHost(sae),true);
 assert.equal(isApprovedOfficialBibleHost(officialDevotionPassageUrl(sample,'NIV')),true);
 const joh={scripture:[{book:{id:'JHN'},chapter:3,verses:[{verse:16}]}]};
 assert.match(officialDevotionPassageUrl(joh,'SAE'),/book=jhn&chap=3&sec=16/);
 assert.match(officialDevotionPassageUrl(joh,'NIV'),/JHN\.3\.niv/);
 for(const evil of [null,undefined,'','javascript:alert(1)','https://www.bible.com.evil.test/bible/111/1CO.4.niv','http://www.bible.com/bible/111/1CO.4.niv','https://evil.test','https://www.bible.com/bible/111/not-real']){
  assert.equal(isApprovedOfficialBibleHost(evil),false,String(evil));
 }
 for(const fake of [{scripture:[{book:{id:'1CO'},chapter:-1}]},{scripture:[{book:{id:'1CO'},chapter:'4abc'}]},{scripture:[{book:{id:'../../etc'},chapter:4}]}]){
  assert.equal(officialDevotionPassageUrl(fake,'SAE'),null);
  assert.equal(officialDevotionPassageUrl(fake,'NIV'),null);
 }
});
class FakeElement{
 constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.listeners={};this.dataset={};this.textContent='';this.value='';this.disabled=false;this.hidden=false;this.className='';this.style={};}
 append(...xs){this.children.push(...xs)}
 replaceChildren(...xs){this.children=xs}
 addEventListener(type,fn){this.listeners[type]=fn}
 setAttribute(key,value){this.attributes[key]=value}
 click(){this.listeners.click?.()}
}
test('selection of protected translation prevents old KRV TTS and opens only approved provider',()=>{
 const calls=[],spoken=[];
 const win={
  open:(...args)=>{calls.push(args);return {}},
  Audio:class {play(){} pause(){}},
  fetch:async ()=>({ok:false,json:async()=>({})}),
  speechSynthesis:{getVoices:()=>[],speak:segment=>spoken.push(segment),cancel:()=>{}},
  SpeechSynthesisUtterance:class {constructor(text){this.text=text}},
  addEventListener:()=>{},clearTimeout:()=>{},setTimeout:()=>{},
  localStorage:{getItem:()=>null,setItem:()=>{}}
 };
 const doc={createElement:tag=>new FakeElement(tag)};
 const ui=createDevotionSpeechUI(win,doc);
 ui.setData(sample);
 const play=ui.element.children.find(el=>el.dataset?.speechAction==='play');
 const url=officialDevotionPassageUrl(sample,'NIV');
 ui.setOfficialListening({url,label:'NIV'});
 assert.equal(play.textContent,'공식 듣기');
 assert.equal(play.disabled,false);
 play.click();
 assert.deepEqual(calls,[[url,'_blank','noopener,noreferrer']]);
 assert.equal(spoken.length,0,'must never speak the KRV text while NIV selected');
 ui.setOfficialListening({url:'https://malicious.test',label:'NIV'});
 assert.equal(play.disabled,true,'unapproved external host may not open');
 play.click();
 assert.equal(calls.length,1);
 ui.setOfficialListening(null);
 assert.equal(play.textContent,'본문 듣기');
});
test('devotion renderer associates version buttons with passage and copyright-safe official state',()=>{
 const source=read('bible/devotion.js'),speech=read('bible/devotion-speech-ui.js'),css=read('bible/devotion.css');
 assert.match(source,/import \{ DEVOTION_VERSIONS,isDevotionVersion,officialDevotionPassageUrl \}/);
 assert.match(source,/const storedVersion=storageGet\(versionKey\)/);
 assert.match(source,/versions\.setAttribute\('aria-label','성경 번역본 선택'\)/);
 assert.match(source,/btn\.setAttribute\('aria-pressed',String\(selectedScriptureVersion===version\.id\)\)/);
 assert.match(source,/storageSet\(versionKey,selectedScriptureVersion\)/);
 assert.match(source,/speechUI\.setOfficialListening\(\{url,label:version\.label\}\)/);
 assert.match(source,/speechUI\.setOfficialListening\(null\)/);
 assert.match(source,/link\.rel='noopener noreferrer'/);
 assert.match(source,/저작권 보호를 위해/);
 assert.match(speech,/if\(officialSelection\)/);
 assert.match(css,/DEVOTION-SCRIPTURE-VERSIONS-001/);
 assert.match(css,/\.dv-speech-tools \.dv-speech-engine\{\s*grid-column:1\/3;grid-row:4/);
 assert.match(css,/\.dv-speech-tools \.dv-speech-speed\{\s*grid-column:3;grid-row:4/);
 assert.doesNotMatch(source,/fetch\([^)]*bskorea|fetch\([^)]*bible\.com|innerHTML\s*=\s*.+NIV/);
});
