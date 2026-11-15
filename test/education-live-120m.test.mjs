import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {COURSE as ORIGINAL} from '../education/study/live/courses/mnu-factchat-2026.js';
import {COURSE as SHORT} from '../education/study/live/courses/mnu-factchat-120m-2026.js';
import {NOTES} from '../education/study/live/courses/mnu-factchat-120m-2026.notes.js';
import {COURSES,courseEntry,DEFAULT_COURSE_ID} from '../education/study/live/courses/registry.js';
import {validateCourse,totalMinutes,practiceMinutes,practiceModules,sessionSlides,buildPrompts,missionMaterials,learnerUrl,parseLearnerParams} from '../education/study/live/engine/model.js';
import {isGatedPath} from '../education-instructor-gate.js';

test('additive course registry retains both existing courses and their default',()=>{
  assert.equal(DEFAULT_COURSE_ID,'mnu-factchat-2026');
  assert.equal(ORIGINAL.id,DEFAULT_COURSE_ID);
  assert.equal(ORIGINAL.sessions.length,2);
  assert.equal(totalMinutes(ORIGINAL),240);
  assert.equal(practiceMinutes(ORIGINAL),120);
  assert.ok(COURSES.find(c=>c.id==='mnu-staff-ai-2026'&&c.engine==='classroom'));
  const added=COURSES.find(c=>c.id==='mnu-factchat-120m-2026');
  assert.ok(added&&added.engine==='live'&&typeof added.load==='function'&&typeof added.loadNotes==='function');
  assert.equal(courseEntry(SHORT.id).id,SHORT.id);
  assert.equal(new Set(COURSES.map(c=>c.id)).size,COURSES.length);
});
test('concentrated workshop is 120 continuous minutes with 90 minutes of practice',()=>{
  assert.equal(validateCourse(SHORT),true);
  assert.equal(SHORT.sessions.length,1);
  assert.equal(totalMinutes(SHORT),120);
  assert.equal(practiceMinutes(SHORT),90);
  assert.deepEqual(practiceModules(SHORT).map(m=>[m.session,m.missionId,m.start,m.end]),[
    [1,'hwp',12,37],[1,'minutes',37,62],[1,'ppt',62,82],[1,'free',82,102]
  ]);
  assert.deepEqual(SHORT.sessions[0].modules.map(m=>[m.start,m.end]),[
    [0,5],[5,12],[12,37],[37,62],[62,82],[82,102],[102,113],[113,120]
  ]);
  assert.equal(SHORT.missions.hwp.minutes,25);
  assert.equal(SHORT.missions.minutes.minutes,25);
  assert.equal(SHORT.missions.ppt.minutes,20);
  assert.equal(SHORT.missions.free.minutes,20);
});
test('all seven job tracks, five levels, fictional practice materials and safety rules remain',()=>{
  assert.deepEqual(SHORT.tracks.map(t=>t.id),ORIGINAL.tracks.map(t=>t.id));
  assert.deepEqual(SHORT.levels.map(l=>l.id),ORIGINAL.levels.map(l=>l.id));
  assert.equal(SHORT.tracks.length,7);
  assert.equal(SHORT.levels.length,5);
  assert.equal(SHORT.tracks.every(t=>t.roles.length===3),true);
  assert.equal(SHORT.syntheticOnly,true);
  assert.match(SHORT.safety,/개인정보/);
  for(const mission of Object.keys(SHORT.missions)){
    for(const t of SHORT.tracks){
      const files=missionMaterials(SHORT,mission,t.id);
      const prompts=buildPrompts(SHORT,mission,t.id,'advanced');
      assert.equal(prompts.length,2);
      assert.ok(prompts.every(p=>!p.text.includes('undefined')&&!p.text.includes('[object Object]')));
      if(mission!=='free')assert.ok(files.some(f=>/가상|허구/.test(f.text)),mission+'/'+t.id);
    }
  }
  assert.match(buildPrompts(SHORT,'ppt','student','basic')[0].text,/3장/);
  assert.match(buildPrompts(SHORT,'minutes','facility','basic')[0].text,/보류/);
});
test('all modules have instructor speaking cards and learner slides; notes stay protected',async()=>{
  const ids=SHORT.sessions[0].modules.map(m=>m.id);
  assert.ok(ids.every(id=>NOTES[id]&&NOTES[id].talk.length),'every new module has talk and timings');
  const slides=sessionSlides(SHORT,1);
  assert.ok(ids.every(id=>slides.some(s=>s.moduleId===id)));
  assert.equal(slides.filter(s=>s.special==='join').length>=2,true);
  assert.equal(isGatedPath('/study/live/courses/mnu-factchat-120m-2026.notes.js'),true);
  assert.equal(isGatedPath('/study/live/courses/mnu-factchat-120m-2026.js'),false);
  const lab=await readFile(new URL('../education/study/live/lab.js',import.meta.url),'utf8');
  assert.doesNotMatch(lab,/import\s+.*\.notes\.js/);
});
test('short course deep links and print route are independent of original course',()=>{
  const joined=learnerUrl('https://ekodi.kr','/edu/study/live/',{c:SHORT.id,s:1,m:'hwp'});
  assert.match(joined,/c=mnu-factchat-120m-2026/);
  assert.match(joined,/s=1&m=hwp/);
  const parsed=parseLearnerParams(new URL(joined).search,SHORT);
  assert.equal(parsed.c,SHORT.id);
  assert.equal(parsed.s,1);
  assert.equal(parsed.m,'hwp');
});
