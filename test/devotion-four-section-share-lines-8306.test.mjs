import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {devotionSectionShareDetails,formatDevotionSectionShareMessage,formatDevotionShareMessage} from '../bible/devotion-share-audio.js';

const day={
 found:true,date:'2026-11-05',passage:'고린도전서 5:1-13',
 activities:{
  poem:{title:'회복의 시',lines:['첫 번째 시구','두 번째 시구','','마지막 시구']},
  song:{title:'함께 부르는 찬양',verse:['첫 절','둘째 절'],refrain:['후렴 하나','후렴 둘']},
  prayer:'주님, 이웃을 살리게 하소서.\n우리의 삶을 붙드소서.',
  questions:[{kind:'해석',text:'무엇을 바라보는가?'},{kind:'실천',text:'누구에게 나아갈 것인가?'}],
  action:'이웃에게 먼저 연락하기',
  family:'가족과 함께 나눕니다.',
  keyLine:'오늘의 핵심 문장',
 }
};
const urlFor=kind=>'https://ekodi.kr/ekodichurch/devotion/?date='+day.date+'#'+kind;

test('only four explicitly selected tabs receive clean date/title/content/link sharing',()=>{
 for(const kind of ['poem','song','prayer','questions']){
  const section=devotionSectionShareDetails(day,kind);
  assert.ok(section);
  const message=formatDevotionSectionShareMessage({
   date:day.date,title:'에코디교회 오늘의 매일묵상 · '+section.title,
   content:section.content,url:urlFor(kind)
  });
  assert.match(message,/^에코디언의 묵상나눔\n2026년 11월 5일 목요일\n/u);
  assert.ok(message.includes('\n'+section.content+'\n'));
  assert.ok(message.endsWith(urlFor(kind)));
  assert.doesNotMatch(message,/(?:일자|제목|내용|링크): /u);
  assert.equal(message.split(urlFor(kind)).length,2);

 }
 for(const kind of ['page','family','mine','action','image'])assert.equal(devotionSectionShareDetails(day,kind),null);
});

test('full poem and song preserve embedded line breaks, refrain and empty stanza',()=>{
 const poem=devotionSectionShareDetails(day,'poem');
 const message=formatDevotionSectionShareMessage({date:day.date,title:poem.title,content:poem.content,url:urlFor('poem')});
 assert.ok(message.includes('첫 번째 시구\n두 번째 시구\n\n마지막 시구\nhttps://ekodi.kr/'));
 const song=devotionSectionShareDetails(day,'song');
 assert.ok(song.content.includes('첫 절\n둘째 절\n후렴: 후렴 하나 / 후렴 둘'));
 assert.equal(song.title,'묵상 노래 · 함께 부르는 찬양');
});

test('full prayer, all questions and action remain intact, not first-line 180-character excerpts',()=>{
 const long='함께하는 기도 '.repeat(50);
 const prayer=devotionSectionShareDetails({...day,activities:{...day.activities,prayer:long}},'prayer');
 const message=formatDevotionSectionShareMessage({date:day.date,title:prayer.title,content:prayer.content,url:urlFor('prayer')});
 assert.ok(message.includes(long.trim()));
 assert.ok(!message.includes('…'));
 const questions=devotionSectionShareDetails(day,'questions').content;
 assert.match(questions,/1\. \[해석\] 무엇을 바라보는가\?/u);
 assert.match(questions,/2\. \[실천\] 누구에게 나아갈 것인가\?/u);
 assert.match(questions,/오늘의 실천: 이웃에게 먼저 연락하기/u);
});

test('invalid dates and foreign domains rejected for the four special tab shares',()=>{
 const f={date:day.date,title:'묵상기도',content:'함께 기도',url:urlFor('prayer')};
 assert.throws(()=>formatDevotionSectionShareMessage({...f,date:'2026-02-30'}),/invalid_devotion_date/);
 assert.throws(()=>formatDevotionSectionShareMessage({...f,url:'https://evil.example/devotion'}),/invalid_devotion_url/);
 assert.equal(formatDevotionShareMessage({...f,excerpt:'기도문'}).split('\n')[0],'2026년 11월 5일 목요일');
});

test('shared Church, Mission and Bible renderer branches only for selected sections',async()=>{
 const code=await readFile(new URL('../bible/devotion.js',import.meta.url),'utf8');
 assert.match(code,/const section=devotionSectionShareDetails\(current,kind\)/);
 assert.match(code,/formatDevotionSectionShareMessage\(\{date:current.date,title,content:section.content,url\}\)/);
 assert.match(code,/navigator\.share\(\{ text: message \}\)/);
 assert.match(code,/devotionShareExcerpt\(current, kind, privatePrayer\)/);
 for(const site of ['ekodichurch','ekodimission','bible']){
  const dir=site==='bible'?'bible/devotion.html':site==='ekodichurch'?'sites/ekodi-church/devotion/index.html':'space/ekodimission-devotion.page';
  assert.ok((await readFile(new URL('../'+dir,import.meta.url),'utf8')).includes('devotion'));
 }
});
