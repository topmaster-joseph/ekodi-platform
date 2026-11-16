import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {COURSE as FOUR_HOURS} from '../education/study/live/courses/mnu-factchat-2026.js';
import {COURSE as TWO_HOURS} from '../education/study/live/courses/mnu-factchat-120m-2026.js';
import {validateCourse,missionMaterials,totalMinutes,practiceMinutes} from '../education/study/live/engine/model.js';
import {DEMOS,SESSION_PICKS} from '../education/study/live/guide/demos.js';
import {FLOW,SESSIONS} from '../education/study/live/guide/data.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('original schedules and focused schedules are preserved',()=>{
  assert.equal(validateCourse(FOUR_HOURS),true);
  assert.equal(validateCourse(TWO_HOURS),true);
  assert.equal(totalMinutes(FOUR_HOURS),240);
  assert.equal(totalMinutes(TWO_HOURS),120);
  assert.equal(practiceMinutes(FOUR_HOURS),120);
  assert.equal(practiceMinutes(TWO_HOURS),90);
  assert.ok(SESSIONS.length>=6);
  assert.ok(FLOW.some(f=>f.mission==='minutes'));
});

test('each of seven job tracks in both courses offers synthetic meeting text as UTF-8 TXT',()=>{
  for(const c of [FOUR_HOURS,TWO_HOURS]){
    assert.equal(c.tracks.length,7);
    for(const track of c.tracks){
      const files=missionMaterials(c,'minutes',track.id);
      const script=files.find(f=>f.name.endsWith('_meeting-script.txt'));
      assert.ok(script,c.id+'/'+track.id+' has TXT');
      assert.match(script.label,/가상 회의/);
      assert.match(script.text,/^\[가상 회의 대본/);
      assert.ok(script.text.includes('\n'));
      assert.ok(script.text.length>120);
      assert.match(script.name,/^[a-z0-9_-]+\.txt$/);
    }
    assert.ok(c.missions.minutes.steps.some(s=>s.includes('일반 채팅')&&s.includes('TXT')));
    assert.ok(c.missions.minutes.steps.some(s=>s.includes('삭제')));
  }
});

test('all six instructor cohorts include a meeting demo with a downloadable fictional transcript',()=>{
  const meetings=DEMOS.filter(d=>d.mission==='minutes');
  assert.ok(meetings.length>=6);
  for(const d of meetings){
    assert.match(d.sample,/^\[가상 대본\]/);
    assert.match(d.sample,/팀장:|과장:|기업 측:|주무관A:|주무관B:/);
  }
  for(const n of [1,2,3,4,5,6]){
    const demos=(SESSION_PICKS[n]?.p2||[]).map(id=>DEMOS.find(d=>d.id===id));
    assert.ok(demos.some(d=>d?.mission==='minutes'),'cohort '+n);
  }
});

test('learner and instructor see transcript, TXT download and correct Chat/Meeting Notes separation',async()=>{
  const lab=await read('education/study/live/lab.js');
  const guide=await read('education/study/live/guide/guide.js');
  assert.match(lab,/meeting-script/);
  assert.match(lab,/data-download-material/);
  assert.match(lab,/downloadText\(document,f.name,f.text\)/);
  assert.match(lab,/실제 녹음 전사본이 아닌/);
  assert.match(lab,/전용 「회의록」 메뉴는 음성/);
  assert.match(guide,/g-meeting-material/);
  assert.match(guide,/data-download-meeting/);
  assert.match(guide,/downloadText\(document,'mnu-factchat-'/);
  assert.match(guide,/TXT는 FactChat 「일반 채팅」/);
  assert.match(guide,/실습이 끝나면 각자 즉시 삭제/);
});

test('one user can immediately clear only their own course-specific local records, never external FactChat data',async()=>{
  const lab=await read('education/study/live/lab.js');
  const markup=await read('education/study/live/lab/index.html');
  assert.match(lab,/key='ekodi_edu_lab_v1:'\+course.id/);
  assert.match(lab,/data-clear-minutes/);
  assert.match(lab,/data-clear-course/);
  assert.match(lab,/delete rec.results.minutes/);
  assert.match(lab,/delete rec.memo.minutes/);
  assert.match(lab,/storage\?\.removeItem\(key\)/);
  assert.match(lab,/FactChat 회의·채팅 기록과 다운로드 파일은 별도로 직접 삭제/);
  assert.match(markup,/id="labClear"/);
  assert.doesNotMatch(lab,/localStorage\.clear\(\)/);
});
