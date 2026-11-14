import test from 'node:test';
import assert from 'node:assert/strict';
import { isKoreanVoice,knownKoreanVoiceGender,koreanVoices,chooseKoreanVoice,preferredKoreanDeviceVoice } from '../bible/devotion-voice-catalog.js';
import { createDevotionSpeechUI } from '../bible/devotion-speech-ui.js';
import { devotionSpeechSegments } from '../bible/devotion-share-audio.js';

const male={lang:'ko-KR',name:'Microsoft InJoon Online (Natural) - Korean (Korea)',voiceURI:'ko-Microsoft-InJoon',localService:false};
const female={lang:'ko-KR',name:'Microsoft SunHi Online (Natural) - Korean (Korea)',voiceURI:'ko-Microsoft-SunHi',localService:false};
const unknown={lang:'ko-KR',name:'Google 한국어',voiceURI:'google-ko',default:true};
const english={lang:'en-US',name:'Google English',voiceURI:'google-en'};
const sample={found:true,passage:'고린도전서 3:10-23',scripture:[{ok:true,verses:[{verse:10,text:'그 터는 예수 그리스도입니다.'}]}],activities:{keyLine:'진리 위에 우리의 삶을 세웁니다.',prayer:'주님, 우리를 이끌어 주소서.'}};

test('male and female are recognized only from documented Korean speaker names',()=>{
 assert.equal(knownKoreanVoiceGender(male),'male');
 assert.equal(knownKoreanVoiceGender(female),'female');
 assert.equal(knownKoreanVoiceGender(unknown),null);
 assert.equal(knownKoreanVoiceGender(english),null);
 assert.equal(isKoreanVoice({lang:'ko'}),true);
 assert.equal(chooseKoreanVoice([unknown,english,male], 'male'), male);
 assert.equal(chooseKoreanVoice([unknown,english,female], 'female'), female);
 assert.equal(chooseKoreanVoice([unknown,english], 'male'), null);
 assert.equal(chooseKoreanVoice([unknown,female,male]),female,'prefer known natural voice over generic default');
 assert.deepEqual(koreanVoices([english]),[]);
 assert.equal(preferredKoreanDeviceVoice([male,female,unknown]),unknown,'prefer actual Google Korean on Chrome');
 assert.equal(preferredKoreanDeviceVoice([male,female]),male,'equally ranked natural Korean voices preserve stable input order');
 assert.equal(preferredKoreanDeviceVoice([english]),null,'never select an English device voice');
});

class E {
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.listeners={};this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.dataset={};}
 append(...children){this.children.push(...children)}
 replaceChildren(...children){this.children=children}
 setAttribute(key,value){this.attrs[key]=value}
 addEventListener(name,fn){this.listeners[name]=fn}
 click(){this.listeners.click?.()}
 change(value){this.value=value;this.listeners.change?.()}
}
function harness(voices,storage) {
 const spoken=[],events={},synthListeners={};
 const store=storage||new Map();
 const speechSynthesis={
   getVoices:()=>voices,
   addEventListener:(name,fn)=>{synthListeners[name]=fn},
   speak:u=>spoken.push(u),cancel:()=>{},pause:()=>{},resume:()=>{},
 };
 const win={speechSynthesis,SpeechSynthesisUtterance:class{constructor(text){this.text=text}},
   localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
   addEventListener:(name,fn)=>{events[name]=fn},
   setTimeout:fn=>{fn();return 1},clearTimeout:()=>{},
 };
 const ui=createDevotionSpeechUI(win,{createElement:tag=>new E(tag)});
 const [play,pause,repeat,stop,speedLabel,status,genderLabel,voiceLabel]=ui.element.children;
 const gender=genderLabel.children[0],voice=voiceLabel.children[0],speed=speedLabel.children[0];
 ui.setData(sample);
 return {ui,spoken,play,pause,repeat,stop,speed,gender,voice,status,synthListeners,store};
}
test('gender mode explicitly selects documented natural male or female Korean voice',()=>{
 const h=harness([unknown,male,female,english]);
 assert.equal(h.spoken.length,0);
 assert.deepEqual(h.gender.children.map(o=>o.textContent),['자동','남성','여성']);
 h.gender.change('male');
 h.play.click();
 assert.equal(h.spoken.at(-1).voice.voiceURI,male.voiceURI);
 assert.equal(h.spoken.at(-1).rate,.94);
 assert.equal(h.spoken.at(-1).pitch,1);
 h.stop.click();
 h.gender.change('female');
 h.play.click();
 assert.equal(h.spoken.at(-1).voice.voiceURI,female.voiceURI);
 h.stop.click();
 assert.equal(h.spoken.length,2);
 assert.match(h.status.textContent,/듣기/);
});
test('missing male/female voice is reported instead of falsifying the requested gender',()=>{
 const h=harness([unknown,english]);
 h.gender.change('male');
 h.play.click();
 assert.equal(h.spoken.length,0);
 assert.match(h.status.textContent,/남성.*없습니다/);
 h.gender.change('auto');
 h.play.click();
 assert.equal(h.spoken.length,1);
 assert.equal(h.spoken[0].voice.voiceURI,unknown.voiceURI);
});
test('unclassified voices remain selectable by actual device name, and user choice persists across mounts',()=>{
 const store=new Map();
 const first=harness([unknown,female,male],store);
 first.voice.change('google-ko');
 first.speed.change('0.82');
 first.play.click();
 assert.equal(first.spoken.at(-1).voice.voiceURI,'google-ko');
 first.stop.click();
 const second=harness([male,unknown,female],store);
 assert.equal(second.voice.value,'google-ko');
 assert.equal(second.speed.value,'0.82');
 assert.equal(second.gender.value,'auto');
 second.gender.change('male');
 assert.equal(second.voice.value,'');
 second.play.click();
 assert.equal(second.spoken.at(-1).voice.voiceURI,male.voiceURI);
});
test('later-loaded voice list refreshes list without autoplay or confusing language',()=>{
 const voices=[unknown];
 const h=harness(voices);
 assert.equal(h.voice.children.length,2);
 voices.push(male,female);
 h.synthListeners.voiceschanged();
 assert.equal(h.voice.children.length,4);
 assert.equal(h.spoken.length,0);
 assert.ok(h.voice.children.some(item=>item.textContent.includes('남성')));
});

test('installed Google Korean voice is the visible initial device selection, without autoplay',()=>{
 const h=harness([female,unknown,male,english]);
 assert.equal(h.voice.value,'google-ko');
 assert.equal(h.spoken.length,0);
 h.play.click();
 assert.equal(h.spoken[0].voice.voiceURI,'google-ko');
 h.stop.click();
});

test('repeat listening loops only after explicit opt-in and stops with the stop button',()=>{
 const h=harness([unknown,male]);
 const loop=h.ui.element.children.find(el=>el.dataset?.speechAction==='loop');
 const segmentCount=devotionSpeechSegments(sample).length;
 assert.ok(segmentCount>1);
 assert.equal(loop.attrs['aria-pressed'],'false');
 loop.click();
 assert.equal(loop.attrs['aria-pressed'],'true');
 assert.equal(h.spoken.length,0,'toggling loop must never auto-play');
 h.play.click();
 const first=h.spoken[0].text;
 for(let index=0;index<segmentCount;index++)h.spoken.at(-1).onend();
 assert.equal(h.spoken.length,segmentCount+1,'completion queues the first segment again');
 assert.equal(h.spoken.at(-1).text,first);
 h.stop.click();
 assert.equal(loop.attrs['aria-pressed'],'false','stop clears looping');
 const prior=h.spoken.length;
 h.play.click();
 for(let index=0;index<segmentCount;index++)h.spoken.at(-1).onend();
 assert.equal(h.spoken.length,prior+segmentCount,'one-shot mode ends without looping');
 assert.match(h.status.textContent,/끝났습니다/);
});

test('voice appears after asynchronous browser voice loading, keeping device mode',()=>{
 const voices=[];
 const h=harness(voices);
 assert.equal(h.voice.value,'');
 voices.push(unknown);
 h.synthListeners.voiceschanged();
 assert.equal(h.voice.value,'google-ko');
 assert.equal(h.spoken.length,0);
});
