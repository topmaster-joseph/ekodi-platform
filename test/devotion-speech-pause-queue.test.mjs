import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevotionSpeechUI} from '../bible/devotion-speech-ui.js';
import {devotionSpeechSegments} from '../bible/devotion-share-audio.js';

const sample = {
  found:true,date:'2026-11-21',passage:'고린도전서 11:27-34',
  scripture:[{ok:true,verses:[
    {verse:27,text:'각 사람은 자기를 살피고.'},
    {verse:28,text:'그 후에 이 떡을 먹고 이 잔을 마실지니.'}
  ]}],
  activities:{keyLine:'서로를 돌아봅시다.',prayer:'하나님, 우리를 인도하소서.'}
};
class FakeElement {
  constructor(tag) {
    this.tag=tag; this.children=[]; this.dataset={}; this.attrs={}; this.listeners={};
    this.value=''; this.disabled=false; this.hidden=false; this.textContent=''; this.className='';
  }
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(name,value){this.attrs[name]=String(value);}
  getAttribute(name){return this.attrs[name]??null;}
  addEventListener(name,fn){this.listeners[name]=fn;}
  click(){this.listeners.click?.();}
}
function harness() {
  const spoken=[],timers=new Map(),actions={pause:0,resume:0,cancel:0};
  let serial=0;
  const voices=[{lang:'ko-KR',name:'Google 한국어',voiceURI:'test-google-ko',default:true}];
  const win={
    speechSynthesis:{
      getVoices:()=>voices,addEventListener:()=>{},
      speak:utterance=>spoken.push(utterance),
      cancel:()=>{actions.cancel++;},
      pause:()=>{actions.pause++;},resume:()=>{actions.resume++;}
    },
    SpeechSynthesisUtterance:class {constructor(text){this.text=text;}},
    fetch:async()=>({ok:false}),
    localStorage:{getItem:()=>null,setItem:()=>{}},
    addEventListener:()=>{},
    setTimeout:(fn,delay)=>{const id=++serial;timers.set(id,{fn,delay});return id;},
    clearTimeout:id=>{timers.delete(id);}
  };
  const ui=createDevotionSpeechUI(win,{createElement:tag=>new FakeElement(tag)});
  const buttons=Object.fromEntries(ui.element.children
    .filter(node=>node.dataset.speechAction)
    .map(node=>[node.dataset.speechAction,node]));
  ui.setData(sample);
  function flush() {
    const next=timers.entries().next().value;
    if (!next) return false;
    const [id,entry]=next;
    timers.delete(id);entry.fn();
    return true;
  }
  return {ui,spoken,timers,actions,buttons,flush};
}
test('pausing between phrases cancels queued speech until resume, without auto-speaking',()=>{
  const h=harness();
  h.buttons.play.click();
  assert.equal(h.spoken.length,1);
  h.spoken.at(-1).onend();
  assert.equal(h.timers.size,1,'next phrase initially scheduled');
  h.buttons.pause.click();
  assert.equal(h.actions.pause,1);
  assert.equal(h.timers.size,0,'pause cancels next phrase timer');
  assert.equal(h.flush(),false,'no executable segment remains during pause');
  assert.equal(h.spoken.length,1);
  h.buttons.pause.click();
  assert.equal(h.actions.resume,1);
  assert.equal(h.timers.size,1,'resume requeues the exact pending segment');
  h.flush();
  assert.equal(h.spoken.length,2,'next segment starts once after explicit resume');
  assert.notEqual(h.spoken[0].text,h.spoken[1].text);
  h.buttons.stop.click();
  assert.equal(h.timers.size,0);
});
test('repeat cycle gap remains silent while paused, then resumes at the first segment',()=>{
  const h=harness();
  const count=devotionSpeechSegments(sample).length;
  assert.ok(count>1);
  h.buttons.loop.click();
  assert.equal(h.buttons.loop.getAttribute('aria-pressed'),'true');
  h.buttons.play.click();
  const first=h.spoken[0].text;
  for(let i=0;i<count;i++) {
    h.spoken.at(-1).onend();
    assert.equal(h.flush(),true);
  }
  assert.equal(h.spoken.length,count,'completed a whole cycle but has not restarted yet');
  assert.equal([...h.timers.values()][0]?.delay,450,'repeat gap is deliberate');
  h.buttons.pause.click();
  assert.equal(h.timers.size,0);
  assert.equal(h.spoken.length,count);
  h.buttons.pause.click();
  assert.equal([...h.timers.values()][0]?.delay,450);
  h.flush();
  assert.equal(h.spoken.length,count+1);
  assert.equal(h.spoken.at(-1).text,first);
  h.buttons.stop.click();
  assert.equal(h.buttons.loop.getAttribute('aria-pressed'),'false');
  assert.equal(h.timers.size,0);
});
test('switching repeat off during a queued restart prevents an unwanted extra cycle',()=>{
  const h=harness();
  h.buttons.loop.click();
  h.buttons.play.click();
  const count=devotionSpeechSegments(sample).length;
  for(let i=0;i<count;i++){h.spoken.at(-1).onend();h.flush();}
  assert.equal(h.spoken.length,count);
  assert.equal([...h.timers.values()][0]?.delay,450);
  h.buttons.loop.click();
  assert.equal(h.buttons.loop.getAttribute('aria-pressed'),'false');
  assert.equal(h.timers.size,0);
  assert.equal(h.flush(),false);
  assert.equal(h.spoken.length,count);
  assert.match(h.ui.element.children.find(e=>e.className==='dv-speech-status').textContent,/끝났습니다/);
});
test('stop during an interphrase gap cancels both queued work and looping',()=>{
  const h=harness();
  h.buttons.loop.click();
  h.buttons.play.click();
  h.spoken[0].onend();
  assert.equal(h.timers.size,1);
  h.buttons.stop.click();
  assert.equal(h.buttons.loop.getAttribute('aria-pressed'),'false');
  assert.equal(h.timers.size,0);
  assert.equal(h.flush(),false);
  assert.equal(h.spoken.length,1);
});
