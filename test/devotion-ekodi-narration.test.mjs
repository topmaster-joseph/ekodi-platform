import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {approvedNarration,narrationManifestUrl,createEkodiNarrationPlayer} from '../bible/devotion-ekodi-narration.js';
import {createDevotionSpeechUI} from '../bible/devotion-speech-ui.js';
const date='2026-11-02';
const good={
  schema:'ekodi.devotion.narration.v1',date,status:'approved',language:'ko-KR',
  review:{rights:true,textIntegrity:true,voicePerformance:true,accessibility:true},
  tracks:{
    male:{file:'male.mp3',status:'approved',sha256:'a'.repeat(64),durationSec:122},
    female:{file:'female.mp3',status:'approved',sha256:'b'.repeat(64),durationSec:132}
  }
};
const sample={found:true,date,passage:'고린도전서 3:10-23',scripture:[{ok:true,verses:[{verse:10,text:'그 터는 그리스도라'}]}],activities:{keyLine:'반석 위에 세웁니다',prayer:'주님 저희를 인도하소서'}};
test('public manifest refuses unapproved, future-day impersonation, altered and one-voice releases',()=>{
 assert.equal(narrationManifestUrl('2026-02-30'),null);
 assert.equal(narrationManifestUrl(date),'/bible/narration/2026-11-02/manifest.json');
 const ready=approvedNarration(good,date);
 assert.deepEqual(Object.keys(ready),['male','female']);
 assert.equal(ready.male,'/bible/narration/2026-11-02/male.mp3');
 const stock = {...good,source:{kind:'licensed-stock-preset',model:'supertonic-3',
  modelRevision:'724fb5abbf5502583fb520898d45929e62f02c0b',
  modelLicense:'OpenRAIL-M',synthetic:true,voices:{male:'M4',female:'F5'}}};
 assert.ok(approvedNarration(stock,date));
 assert.equal(approvedNarration({...stock,source:{...stock.source,modelLicense:'unknown'}},date),null);
 assert.equal(approvedNarration({...stock,source:{...stock.source,synthetic:false}},date),null);
 assert.equal(approvedNarration({...stock,source:{...stock.source,voices:{male:'M4',female:'F4'}}},date),null);
 for(const bad of [
  {...good,status:'draft'},
  {...good,date:'2026-11-01'},
  {...good,review:{...good.review,rights:false}},
  {...good,tracks:{male:good.tracks.male}},
  {...good,tracks:{...good.tracks,male:{...good.tracks.male,file:'../books/private.mp3'}}}
 ])assert.equal(approvedNarration(bad,date),null);
});

class FakeAudio {
 static instances=[];
 constructor(src){this.src=src;this.playCount=0;this.paused=false;this.currentTime=0;FakeAudio.instances.push(this);}
 async play(){this.playCount++;this.paused=false;}
 pause(){this.paused=true;}
}
function makeWindow(files=true){
 const requests=[],statuses=[];
 const win={
  Audio:FakeAudio,
  fetch:async (path,opts)=>{
    requests.push({path,method:opts?.method||'GET'});
    if(opts?.method==='HEAD')return {ok:files,headers:{get:()=>files?'audio/mpeg':''}};
    return {ok:files,json:async()=>good};
  }
 };
 const player=createEkodiNarrationPlayer(win);
 player.onStatus((msg,ready)=>statuses.push({msg,ready}));
 return {player,requests,statuses};
}
test('both EKODI voices are real approved audio tracks, not browser pitch shifts',async()=>{
 FakeAudio.instances.length=0;
 const {player,requests}=makeWindow(true);
 assert.equal(player.ready,false);
 await player.load(date);
 assert.equal(player.ready,true);
 assert.deepEqual(requests.map(r=>r.method),['GET','HEAD','HEAD']);
 assert.equal(await player.play('female',.94),true);
 assert.equal(FakeAudio.instances.at(-1).src,'/bible/narration/2026-11-02/female.mp3');
 assert.equal(FakeAudio.instances.at(-1).playbackRate,.94);
 player.pause();assert.equal(FakeAudio.instances.at(-1).paused,true);
 await player.resume();
 assert.equal(FakeAudio.instances.at(-1).playCount,2);
 player.stop();
 assert.equal(await player.play('male',1),true);
 assert.equal(FakeAudio.instances.at(-1).src,'/bible/narration/2026-11-02/male.mp3');
 player.stop();
});
test('missing or unapproved files never falsely enable EKODI engine',async()=>{
 const {player}=makeWindow(false);
 assert.equal(await player.load(date),false);
 assert.equal(player.ready,false);
 assert.equal(await player.play('male'),false);
 assert.match(player.status,/준비되지 않았습니다/);
});

class FakeElement {
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.listeners={};this.value='';this.disabled=false;this.hidden=false;this.textContent='';this.dataset={};}
 append(...n){this.children.push(...n);}
 replaceChildren(...n){this.children=n;}
 addEventListener(name,cb){this.listeners[name]=cb;}
 setAttribute(k,v){this.attrs[k]=v;}
 click(){this.listeners.click?.();}
 change(v){this.value=v;this.listeners.change?.();}
}
test('shared UI exposes separate EKODI engine and safe OS fallback without synthetic gender claims',async()=>{
 const spoken=[];
 const win={
  fetch:async (path,opts)=>opts?.method==='HEAD'?{ok:true,headers:{get:()=> 'audio/mpeg'}}:{ok:true,json:async()=>good},
  Audio:FakeAudio,
  speechSynthesis:{speak:x=>spoken.push(x),cancel:()=>{},getVoices:()=>[{lang:'ko-KR',name:'Google 한국어',voiceURI:'google'}]},
  SpeechSynthesisUtterance:class{constructor(t){this.text=t}},
  addEventListener:()=>{},localStorage:{getItem:()=>null,setItem:()=>{}},
 };
 const ui=createDevotionSpeechUI(win,{createElement:t=>new FakeElement(t)});
 const row=ui.element;
 const engine=row.children.find(el=>el.className==='dv-speech-engine').children[0];
 const gender=row.children.find(el=>el.className==='dv-speech-gender').children[0];
 assert.equal(engine.value,'device');
 ui.setData(sample);
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(engine.children[0].disabled,false);
 assert.equal(engine.value,'device','approved EKODI audio must not silently override device voice');
 engine.change('ekodi');
 gender.change('female');
 row.children[0].click();
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(FakeAudio.instances.at(-1).src,'/bible/narration/2026-11-02/female.mp3');
 row.children[3].click();
 engine.change('device');
 row.children[0].click();
 assert.equal(spoken.length,1);
 assert.equal(spoken[0].voice?.name,'Google 한국어');
});
test('narration publisher never ships sample files without explicit two-speaker approval',()=>{
 const script=readFileSync(new URL('../scripts/ekodi-voice/approve-devotion-narration.mjs',import.meta.url),'utf8');
 assert.match(script,/review\.maleSpeakerConsent/);
 assert.match(script,/review\.femaleSpeakerConsent/);
 assert.match(script,/voicePerformanceApproved/);
 assert.match(script,/textIntegrityApproved/);
 assert.match(script,/not mp3/);
});
