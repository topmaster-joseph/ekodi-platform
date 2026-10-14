import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  MATERIAL_SCHEMA,MAX_SOURCE_BYTES,MAX_EXTRACTED_BYTES,
  fileExtension,describeMaterial,buildLessonDraft,validateLessonDraft,
  updateDraftField,applyDraftToLesson,sourceToDraft,detectContentWarnings,
  assessDraft,serializeDraft,readMaterialFile,extractOfficeText,
} from '../education/study/ai-bootcamp/material-source.js';
import {COURSE} from '../education/study/ai-bootcamp/catalog.js';
const read=path=>fs.readFile(new URL('../'+path,import.meta.url),'utf8');
const draft=()=>buildLessonDraft(COURSE,1,'A');
test('course authors can edit each of four lessons and six cohorts without changing canonical source',()=>{
  assert.equal(COURSE.lessons.length,4);assert.equal(COURSE.batches.length,6);
  for(const lesson of COURSE.lessons)for(const batch of COURSE.batches){
    const original=buildLessonDraft(COURSE,lesson.id,batch.id);
    assert.equal(original.schema,MATERIAL_SCHEMA);
    assert.equal(original.lessonId,lesson.id);
    assert.equal(original.batchId,batch.id);
    assert.equal(original.fields.title,lesson.title);
    const revised=updateDraftField(original,'title','검증된 교안');
    assert.equal(applyDraftToLesson(COURSE,revised).title,'검증된 교안');
    assert.equal(COURSE.lessons.find(x=>x.id===lesson.id).title,lesson.title);
    assert.equal(original.fields.title,lesson.title);
    assert.equal(revised.reviewed,false);
  }
});
test('review-first draft validation rejects foreign courses and malformed fields',()=>{
  const a=draft();
  assert.deepEqual(validateLessonDraft(a,COURSE).fields,a.fields);
  assert.throws(()=>validateLessonDraft({...a,schema:'unknown'},COURSE),/초안 형식/);
  assert.throws(()=>validateLessonDraft({...a,courseId:'other'},COURSE),/교육과정/);
  assert.throws(()=>validateLessonDraft({...a,lessonId:999},COURSE),/회차/);
  assert.throws(()=>validateLessonDraft({...a,fields:{...a.fields,verify:'yes'}},COURSE),/verify/);
  assert.throws(()=>validateLessonDraft({...a,fields:{...a.fields,prompt:'X'.repeat(13000)}},COURSE),/prompt/);
  assert.throws(()=>updateDraftField(a,'privateUserRole','admin'),/없는 강의 항목/);
  const tampered={...a,reviewed:true};
  assert.equal(JSON.parse(serializeDraft(tampered,COURSE)).reviewed,false);
  assert.equal(validateLessonDraft(tampered,COURSE).reviewed,false);
});
test('source edits require explicit target and preserve original course',()=>{
  const a=draft();
  const b=sourceToDraft(a,'1단계\n2단계','steps','replace');
  assert.deepEqual(b.fields.steps,['1단계','2단계']);
  assert.notDeepEqual(b.fields.steps,a.fields.steps);
  assert.equal(sourceToDraft(a,'검증 절차','sample','append').fields.sample,a.fields.sample+'\n\n검증 절차');
  assert.throws(()=>sourceToDraft(a,'','sample'),/텍스트/);
  assert.throws(()=>sourceToDraft(a,'test','internal-state'),/항목/);
  assert.equal(assessDraft(a,COURSE).readyForReview,true);
  assert.equal(assessDraft(updateDraftField(a,'title',''),COURSE).readyForReview,false);
});
test('privacy warnings are conservative, not false claims of compliance',()=>{
  assert.ok(detectContentWarnings('010-1234-5678').length);
  assert.ok(detectContentWarnings('student@example.com').length);
  assert.ok(detectContentWarnings('901231-1234567').length);
  assert.deepEqual(detectContentWarnings('가상의 데이터로만 실습합니다'),[]);
  const a=updateDraftField(draft(),'sample','담당자 010-1234-5678');
  assert.equal(assessDraft(a,COURSE).readyForReview,false);
});
test('material source allowlist, size and unsafe formats fail closed',()=>{
  for(const ext of ['txt','md','csv','json','docx','pptx','hwpx']){
    assert.equal(fileExtension('A.'+ext),ext);
    assert.equal(describeMaterial('A.'+ext,128).extension,ext);
  }
  assert.throws(()=>describeMaterial('private.pdf',12),/지원/);
  assert.throws(()=>describeMaterial('contract.hwp',12),/지원/);
  assert.throws(()=>describeMaterial('spreadsheet.xlsx',12),/지원/);
  assert.throws(()=>describeMaterial('slide.pptx',MAX_SOURCE_BYTES+1),/8MB/);
  assert.ok(MAX_EXTRACTED_BYTES<MAX_SOURCE_BYTES);
});
function storedZip(name,xml){
  const enc=new TextEncoder(),n=enc.encode(name),d=enc.encode(xml),l=new Uint8Array(30+n.length+d.length),c=new Uint8Array(46+n.length),e=new Uint8Array(22);
  const local=new DataView(l.buffer),central=new DataView(c.buffer),end=new DataView(e.buffer);
  local.setUint32(0,0x04034b50,true);local.setUint16(4,20,true);local.setUint32(18,d.length,true);local.setUint32(22,d.length,true);local.setUint16(26,n.length,true);
  l.set(n,30);l.set(d,30+n.length);
  central.setUint32(0,0x02014b50,true);central.setUint16(4,20,true);central.setUint16(6,20,true);
  central.setUint32(20,d.length,true);central.setUint32(24,d.length,true);central.setUint16(28,n.length,true);c.set(n,46);
  end.setUint32(0,0x06054b50,true);end.setUint16(8,1,true);end.setUint16(10,1,true);end.setUint32(12,c.length,true);end.setUint32(16,l.length,true);
  const bytes=new Uint8Array(l.length+c.length+e.length);bytes.set(l);bytes.set(c,l.length);bytes.set(e,l.length+c.length);
  return bytes.buffer;
}
test('office DOCX text extracted locally with XML entities decoded',async()=>{
  const zip=storedZip('word/document.xml','<w:document><w:p><w:r><w:t>AI &amp; 데이터</w:t></w:r></w:p><w:p><w:r><w:t>실습</w:t></w:r></w:p></w:document>');
  const s=await extractOfficeText(zip,'docx');
  assert.match(s,/AI & 데이터/);assert.match(s,/실습/);
  assert.doesNotMatch(s,/<w:t>/);
  const fake={name:'review.docx',size:zip.byteLength,arrayBuffer:async()=>zip};
  assert.equal((await readMaterialFile(fake)).extension,'docx');
});
test('PPTX and HWPX plain text import does not execute or fetch attached assets',async()=>{
  const ppt=await extractOfficeText(storedZip('ppt/slides/slide1.xml','<p:sld><a:p><a:r><a:t>발표 핵심</a:t></a:r></a:p></p:sld>'),'pptx');
  const hwp=await extractOfficeText(storedZip('Contents/section0.xml','<hp:section><hp:p><hp:t>과제 실습</hp:t></hp:p></hp:section>'),'hwpx');
  assert.match(ppt,/발표 핵심/);assert.match(hwp,/과제 실습/);
});
test('academic studio is same-origin, inline-script-free and publishes no upload endpoint',async()=>{
  const [html,js,css,lecture,registry,site]=await Promise.all([
    read('education/study/ai-bootcamp/studio/index.html'),
    read('education/study/ai-bootcamp/studio/studio.js'),
    read('education/study/ai-bootcamp/studio/studio.css'),
    read('education/study/ai-bootcamp/classroom.js'),
    read('platform-route-registry.js'),
    read('wrangler.site.toml'),
  ]);
  assert.match(html,/src="\.\/studio\.js"/);
  assert.match(html,/id="studioPresentation"/);
  assert.match(html,/id="presentDraft"/);
  assert.match(html,/accept="\.txt,\.md,\.csv,\.json,\.docx,\.pptx,\.hwpx"/);
  assert.match(html,/서버나 AI 서비스로 전송/);
  assert.doesNotMatch(html,/<script(?![^>]*src=)[^>]*>/i);
  assert.match(js,/readMaterialFile/);assert.match(js,/serializeDraft/);
  assert.doesNotMatch(js,/\bfetch\s*\(|localStorage|sessionStorage|indexedDB/);
  assert.match(js,/reviewConfirm/);
  assert.match(js,/showModal\(\)/);
  assert.match(js,/drawPresentingSlide/);
  assert.match(js,/presentingIndex/);
  assert.match(css,/@media\(max-width:530px\)/);
  assert.match(lecture,/href="\.\/studio\/"/);
  assert.match(registry,/prefix:'\/edu',binding:'EDUCATION'/);
  assert.doesNotMatch(site,/run_worker_first = \["\/edu\*"/);
});
