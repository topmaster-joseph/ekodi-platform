import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPrivateEditorialPacket} from '../author/human-writer-notes.js';

const questions=[
  ['intent','집필 목적','누구에게 쓰나요?'],
  ['chapter','장별 집필','이번 장에서 살릴 장면은?'],
  ['approval','저자 검토','이 원고를 검토했나요?'],
];
const rows=[
  {stage:'intent',author_answer:'첫 내용'},
  {stage:'chapter',author_answer:'인용 출처를 따로 확인해야 합니다.'},
  {stage:'intent',author_answer:'고친 저자 고유 문장'},
];

test('only persisted latest answers appear, with transparent missing-stage count',()=>{
  const p=buildPrivateEditorialPacket({title:'내 인터뷰 원고',questions,rows});
  assert.equal(p.answered,2);
  assert.equal(p.total,3);
  assert.deepEqual(p.missing,['저자 검토']);
  assert.equal(p.complete,false);
  assert.match(p.markdown,/고친 저자 고유 문장/);
  assert.match(p.markdown,/인용 출처를 따로 확인해야 합니다/);
  assert.doesNotMatch(p.markdown,/첫 내용/);
  assert.match(p.markdown,/저장된 단계 2 \/ 3/);
  assert.match(p.markdown,/비공개 편집 검토 초안/);
  for(const item of ['출처 및 사실 확인','권리와 동의','개인정보','접근성','저자 최종 승인','출판사 별도 승인','ISBN','EPUB 3','환불'])assert.ok(p.markdown.includes(item),item);
  assert.ok(p.markdown.includes('출판 요청 또는 승인이 아닙니다'));
  assert.ok(Object.isFrozen(p));
  assert.ok(Object.isFrozen(p.missing));
});

test('all questions answered is coverage only; not automatic editorial approval',()=>{
  const full=buildPrivateEditorialPacket({title:'초안',questions,rows:[...rows,{stage:'approval',author_answer:'내 문장을 검토했습니다.'}]});
  assert.equal(full.complete,true);
  assert.equal(full.answered,3);
  assert.deepEqual(full.missing,[]);
  assert.match(full.markdown,/저자 최종 승인 및 출판사 별도 승인/);
  const empty=buildPrivateEditorialPacket({title:'',questions,rows:[]});
  assert.equal(empty.answered,0);
  assert.equal(empty.complete,false);
  assert.match(empty.markdown,/저장된 인터뷰 답변이 없습니다/);
});

test('client download requires explicit user click; no network/persistent storage',()=>{
  const ui=readFileSync(new URL('../author/human-writer.js',import.meta.url),'utf8');
  const helper=readFileSync(new URL('../author/human-writer-notes.js',import.meta.url),'utf8');
  assert.match(ui,/const exportDraft=btn\('비공개 편집 검토용 초안\(\.md\) 저장',\(\)=>/);
  assert.match(ui,/new Blob\(\[packet\.markdown\]/);
  assert.match(ui,/URL\.createObjectURL\(blob\)/);
  assert.match(ui,/URL\.revokeObjectURL\(blobUrl\)/);
  assert.match(ui,/exportDraft\.disabled=!readiness\.answered/);
  assert.match(ui,/saved\.textContent='저자가 선택한 비공개 편집용 초안/);
  assert.match(ui,/assemblePrivateInterviewNotes/);
  assert.match(ui,/hasUnsavedInterviewDrafts/);
  for(const source of [ui,helper]){
    assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB|sendBeacon|fetch\(|service_role|automatic_publish/);
  }
});

test('Creator AI surface links only to canonical Books route',()=>{
  const html=readFileSync(new URL('../author/index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../author/app.js',import.meta.url),'utf8');
  for (const source of [html,app]){
    assert.ok(source.includes('https://ekodi.kr/books/'));
    assert.doesNotMatch(source,/https:\/\/books[.]ekodi[.]kr/);
  }
});
