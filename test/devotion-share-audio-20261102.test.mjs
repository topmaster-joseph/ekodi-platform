import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {devotionShareExcerpt,formatDevotionShareMessage,devotionSpeechSegments,spokenScriptureReference} from '../bible/devotion-share-audio.js';
import {createDevotionSpeechUI} from '../bible/devotion-speech-ui.js';

const sample={
 found:true,date:'2026-11-02',passage:'고린도전서 3:10-23',
 scripture:[{ok:true,verses:[{verse:10,text:'내게 주신 하나님의 은혜를 따라 내가 지혜로운 건축자와 같이 터를 닦아 두매'},{verse:11,text:'이 닦아 둔 것 외에 능히 다른 터를 닦아 둘 자가 없으니 이 터는 곧 예수 그리스도라'}]}],
 activities:{
  theme:'터 위에 세우는 삶',
  keyLine:'닦아 둔 터는 예수 그리스도이니, 그 위에 무엇으로 세울지가 오늘의 질문입니다.',
  poem:{lines:['흔들리는 마음에 집을 짓고','다시 주님께 돌아옵니다.']},
  questions:[{kind:'해석',text:'나는 무엇을 기초로 세우는가?'}],
  action:'오늘 만나는 사람을 진실하게 돌봅니다.',
  prayer:'주님, 우리의 삶을 진리 위에 세우게 하소서.'
 }
};

test('Kakao/SMS share string has exactly date, title, single-line body, canonical URL in that order',()=>{
 const message=formatDevotionShareMessage({
  date:sample.date,
  title:'에코디교회 오늘의 매일묵상 · '+sample.passage,
  excerpt:devotionShareExcerpt(sample),
  url:'https://ekodi.kr/ekodichurch/devotion/?date=2026-11-02'
 });
 assert.deepEqual(message.split('\n'),[
  '2026년 11월 2일 월요일',
  '에코디교회 오늘의 매일묵상 · 고린도전서 3:10-23',
  sample.activities.keyLine,
  'https://ekodi.kr/ekodichurch/devotion/?date=2026-11-02'
 ]);
 for(const kind of ['poem','questions','prayer']){
  const excerpt=devotionShareExcerpt(sample,kind);
  assert.ok(!excerpt.includes('\n'));
  assert.equal(formatDevotionShareMessage({date:sample.date,title:kind,excerpt,url:'https://ekodi.kr/bible/devotion/2026-11-02'}).split('\n').length,4);
 }
 assert.throws(()=>formatDevotionShareMessage({date:'2026-02-30',title:'x',excerpt:'y',url:'https://ekodi.kr/a'}),/invalid_devotion_date/);
 assert.throws(()=>formatDevotionShareMessage({date:sample.date,title:'x',excerpt:'y',url:'https://evil.test/a'}),/invalid_devotion_url/);
});

test('share copy omits repeated title or section label without deleting meaningful prayer text',()=>{
 const date='2026-11-03',url='https://ekodi.kr/ekodimission/devotion?date=2026-11-03#prayer';
 const title='에코디선교회 오늘의 매일묵상 · 묵상기도';
 const format=excerpt=>formatDevotionShareMessage({date,title,excerpt,url});
 assert.equal(format(title).split('\n').length,3,'whole repeated headline omitted');
 assert.equal(format('묵상기도').split('\n').length,3,'repeated short title omitted');
 const revised=format('묵상기도: 주님, 오늘 우리를 인도하소서.');
 assert.equal(revised.split('\n').length,4);
 assert.equal(revised.split('\n')[2],'주님, 오늘 우리를 인도하소서.','meaningful prayer text preserved');
 assert.equal(revised.split(url).length,2,'canonical URL occurs once');
 assert.equal(format('서로 돕고 살리는 하루를 주소서.').split('\n').length,4);
});

test('speech reading uses passage, Scripture, reflection, question, action and prayer, with bounded chunks',()=>{
 const segments=devotionSpeechSegments(sample);
 assert.ok(segments[0].includes(spokenScriptureReference(sample.passage)));
 assert.ok(segments.some(s=>s.includes('11절.')));
 assert.ok(segments.some(s=>s.includes(sample.activities.keyLine)));
 assert.ok(segments.some(s=>s.includes(sample.activities.prayer)));
 assert.ok(segments.every(s=>s.length<=210));
 assert.deepEqual(devotionSpeechSegments({found:false}),[]);
 const enormous={...sample,activities:{...sample.activities,keyLine:'글자 '.repeat(250)}};
 assert.ok(devotionSpeechSegments(enormous).every(s=>s.length<=210));
});

class FakeElement{
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.listeners={};this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.dataset={};}
 append(...nodes){this.children.push(...nodes)}
 setAttribute(k,v){this.attrs[k]=v}
 addEventListener(type,cb){this.listeners[type]=cb}
 click(){this.listeners.click?.()}
}
test('speech controls require a click, support pause/resume/restart/stop and cancel on pagehide',()=>{
 const spoken=[];
 let cancels=0,pauses=0,resumes=0;
 const synth={speak:x=>spoken.push(x),cancel:()=>{cancels++},pause:()=>{pauses++},resume:()=>{resumes++},getVoices:()=>[{lang:'ko-KR',name:'ko'}]};
 const events={};
 const win={speechSynthesis:synth,SpeechSynthesisUtterance:class {constructor(text){this.text=text;}},addEventListener:(event,cb)=>{events[event]=cb}};
 const doc={createElement:tag=>new FakeElement(tag)};
 const ui=createDevotionSpeechUI(win,doc);
 const [play,pause,repeat,stop,,status]=ui.element.children;
 assert.equal(spoken.length,0,'never autoplay');
 ui.setData(sample);
 assert.equal(ui.element.hidden,false);
 assert.equal(spoken.length,0);
 play.click();
 assert.equal(spoken.length,1);
 assert.equal(spoken[0].lang,'ko-KR');
 assert.match(status.textContent,/본문 듣는 중/);
 pause.click();assert.equal(pauses,1);assert.equal(pause.textContent,'계속 듣기');
 pause.click();assert.equal(resumes,1);assert.equal(pause.textContent,'일시정지');
 const stale=spoken[0];
 repeat.click();assert.equal(spoken.length,2);
 const afterRepeat=spoken.length;
 stale.onend();
 assert.equal(spoken.length,afterRepeat,'stale canceled utterance must not queue new text');
 stop.click();assert.equal(play.disabled,false);
 const afterStop=spoken.length;
 spoken.at(-1).onend();assert.equal(spoken.length,afterStop);
 play.click();assert.equal(spoken.length,afterStop+1);
 events.pagehide();assert.equal(play.disabled,false);
 assert.ok(cancels>=3);
 ui.setData({found:false});
 assert.equal(ui.element.hidden,true);
});

test('shared renderer keeps login, personal records and the native four-line share payload',async()=>{
 const source=await readFile(new URL('../bible/devotion.js',import.meta.url),'utf8');
 const css=await readFile(new URL('../bible/devotion.css',import.meta.url),'utf8');
 assert.match(source,/createDevotionSpeechUI\(\)/);
 assert.match(source,/speechUI\.setData\(data\)/);
 assert.match(source,/scriptureBlock\.after\(speechUI\.element\)/);
 assert.match(source,/navigator\.share\(\{ text: message \}\)/);
 assert.match(source,/formatDevotionShareMessage\(\{/);
 assert.match(source,/if \(copyOnly\)/);
 assert.match(css,/dv-speech-btn/);
 assert.match(css,/min-height:44px/);
});


test('devotion share removes repeated title and excerpt without duplicating its public link',()=>{
 const args={
   date:'2026-11-03',
   title:'에코디교회 에코디교회 오늘의 매일묵상',
   excerpt:'에코디교회 오늘의 매일묵상',
   url:'https://ekodi.kr/ekodichurch/devotion/?date=2026-11-03'
 };
 const lines=formatDevotionShareMessage(args).split('\n');
 assert.deepEqual(lines,[
   '2026년 11월 3일 화요일',
   '에코디교회 오늘의 매일묵상',
   'https://ekodi.kr/ekodichurch/devotion/?date=2026-11-03'
 ]);
 const different=formatDevotionShareMessage({...args,excerpt:'오늘의 말씀을 듣고 살아냅니다.'}).split('\n');
 assert.equal(different.length,4);
 assert.equal(different[2],'오늘의 말씀을 듣고 살아냅니다.');
 assert.equal(different.at(-1),args.url);
});
