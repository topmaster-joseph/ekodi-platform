import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {OFFICIAL_MNU_2026,OFFICIAL_MNU_PROMPT,officialMnuPracticeCard} from '../education/study/live/materials/official-mnu-2026.js';
import {COURSE as FOUR_HOURS} from '../education/study/live/courses/mnu-factchat-2026.js';
import {COURSE as TWO_HOURS} from '../education/study/live/courses/mnu-factchat-120m-2026.js';
import {validateCourse,totalMinutes,practiceMinutes} from '../education/study/live/engine/model.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('official MNU 2026 uploaded PDF remains byte-for-byte original, separately from synthetic HWPX samples',async()=>{
  const bytes=await readFile(new URL('../education/study/live/materials/mnu-2026-core-competency-points.pdf',import.meta.url));
  assert.equal(bytes.byteLength,178412);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),OFFICIAL_MNU_2026.sha256);
  assert.equal(bytes.subarray(0,5).toString('ascii'),'%PDF-');
  assert.ok(bytes.subarray(bytes.length-4096).toString('latin1').includes('%%EOF'));
  assert.equal(OFFICIAL_MNU_2026.pages,2);
  assert.match(OFFICIAL_MNU_2026.fileName,/\.pdf$/);
  assert.ok(OFFICIAL_MNU_2026.href.endsWith('/materials/mnu-2026-core-competency-points.pdf'));
});
test('real university PDF practice card offers view, download, and exact-original fact-checking prompt',()=>{
  const html=officialMnuPracticeCard(v=>String(v).replace(/[&<>"']/g,''));
  assert.match(html,/실제 공문 원본 PDF/);
  assert.match(html,/원본 PDF 화면으로 보기/);
  assert.match(html,/원본 PDF 다운로드/);
  assert.match(html,/data-copy-official-mnu/);
  assert.match(html,/2026년 12월 31일/);
  assert.match(html,/취업지원실-5071/);
  assert.match(OFFICIAL_MNU_PROMPT,/2022~2025/);
  assert.match(OFFICIAL_MNU_PROMPT,/원문 확인 필요/);
  assert.match(html,/개인 기기의 PDF·결과물/);
  assert.doesNotMatch(html,/\.hwpx/);
});
test('original four-hour and new two-hour FactChat curricula remain unchanged',()=>{
  assert.equal(validateCourse(FOUR_HOURS),true);
  assert.equal(validateCourse(TWO_HOURS),true);
  assert.equal(totalMinutes(FOUR_HOURS),240);
  assert.equal(totalMinutes(TWO_HOURS),120);
  assert.equal(practiceMinutes(TWO_HOURS),90);
  assert.equal(FOUR_HOURS.tracks.length,7);
  assert.equal(TWO_HOURS.tracks.length,7);
});
test('both learner and instructor material UIs link same first-party PDF with no external uploads',async()=>{
  const [lab,instructor]=await Promise.all([
    read('education/study/live/lab.js'),
    read('education/study/live/instructor.js')
  ]);
  assert.match(lab,/officialMnuPracticeCard\(esc\)/);
  assert.match(lab,/id==='hwp'/);
  assert.match(lab,/d\.copyOfficialMnu/); // event handler uses dataset camelCase
  assert.match(instructor,/officialMnuPracticeCard\(esc\)/);
  assert.match(instructor,/copyOfficialMnu/);
  assert.doesNotMatch(lab,/upload.*drive\.google\.com/i);
  assert.doesNotMatch(instructor,/upload.*drive\.google\.com/i);
});
