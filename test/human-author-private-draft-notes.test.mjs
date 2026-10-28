import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { latestSavedByStage, hasUnsavedInterviewDrafts, assemblePrivateInterviewNotes } from '../author/human-writer-notes.js';

const questions=[
  ['intent','집필 목적과 독자','왜 이 책을 집필하나요?'],
  ['chapter','장별 공동 집필','이번 장의 핵심 장면은 무엇인가요?'],
  ['approval','최종 저자 검토','마지막 원고를 검토했나요?']
];
const rows=[
  {stage:'intent',author_answer:'처음 쓴 답변'},
  {stage:'chapter',author_answer:'첫 장면'},
  {stage:'intent',author_answer:'수정한 답변'},
  {stage:'unknown-stage',author_answer:'이 내용을 포함하면 안 됩니다.'}
];

test('drafts remain local to an open dialog and recognize only changed unsaved answers',()=>{
  const latest=latestSavedByStage(rows);
  assert.equal(latest.get('intent'),'수정한 답변');
  const drafts=new Map([['intent','수정한 답변']]);
  assert.equal(hasUnsavedInterviewDrafts(drafts,rows),false);
  drafts.set('intent','새 임시 문장');
  assert.equal(hasUnsavedInterviewDrafts(drafts,rows),true);
  drafts.set('intent','수정한 답변');
  assert.equal(hasUnsavedInterviewDrafts(drafts,rows),false);
  drafts.set('approval','새 인터뷰');
  assert.equal(hasUnsavedInterviewDrafts(drafts,rows),true);
  drafts.delete('approval');
  assert.equal(hasUnsavedInterviewDrafts(drafts,rows),false);
  assert.equal(hasUnsavedInterviewDrafts(new Map(),rows),false);
});

test('only server-saved latest-stage answers are compiled to explicit private editorial Markdown',()=>{
  const notes=assemblePrivateInterviewNotes({title:'비공개 원고',questions,rows});
  assert.match(notes,/^# 비공개 원고/);
  assert.match(notes,/저자가 직접 저장한 인터뷰/);
  assert.match(notes,/출판 승인이 아닙니다/);
  assert.match(notes,/수정한 답변/);
  assert.match(notes,/첫 장면/);
  assert.doesNotMatch(notes,/처음 쓴 답변|이 내용을 포함하면 안 됩니다/);
  assert.ok(notes.indexOf('## 집필 목적과 독자')<notes.indexOf('## 장별 공동 집필'));
  assert.equal(assemblePrivateInterviewNotes({title:'빈 원고',questions,rows:[]}), '');
});

test('UI holds unsaved text when navigating stages, prompts before dismissal and exports only on click',()=>{
  const ui=readFileSync(new URL('../author/human-writer.js',import.meta.url),'utf8');
  assert.match(ui,/const drafts=new Map\(\)/);
  assert.match(ui,/hasUnsavedInterviewDrafts\(drafts,rows\).*window\.confirm/);
  assert.match(ui,/answer\.value=drafts\.has\(stage\)\?drafts\.get\(stage\)/);
  assert.match(ui,/answer\.addEventListener\('input'/);
  assert.match(ui,/drafts\.set\(stage,answer\.value\)/);
  assert.match(ui,/await refresh\(\);drafts\.delete\(stage\)/);
  assert.match(ui,/const copy=btn\('저장된 인터뷰 편집용 정리본 복사'/);
  assert.match(ui,/navigator\.clipboard\.writeText\(notes\)/);
  assert.match(ui,/copy\.disabled=rows\.length===0/);
  assert.match(ui,/answer\.readOnly=true;try\{if\(!\(await verifyBeforeWrite\(\)\)\)/);
  assert.match(ui,/출판 승인은 별도입니다/);
  const helper=readFileSync(new URL('../author/human-writer-notes.js',import.meta.url),'utf8');
  for(const code of [ui,helper]) {
    assert.doesNotMatch(code,/localStorage|sessionStorage|indexedDB|sendBeacon|fetch\(|service_role/);
  }
});
