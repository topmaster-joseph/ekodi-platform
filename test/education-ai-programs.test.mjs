import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PROGRAMS,PROGRAM_SOURCE} from '../education/study/ai-bootcamp/programs/catalog.js';
import {COURSE} from '../education/study/ai-bootcamp/catalog.js';
const get=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('uploaded HWPX registers precisely six independent programs with four source-based sessions each',()=>{
  assert.equal(PROGRAMS.length,6);
  assert.deepEqual(PROGRAMS.map(p=>p.number),[1,2,3,4,5,6]);
  assert.equal(PROGRAMS.reduce((count,p)=>count+p.sessions.length,0),24);
  assert.deepEqual(PROGRAMS.map(p=>p.audience),[
    '초등','초등 · 아두이노 기초','로봇 초급','로봇 중급','중·고등','청년'
  ]);
  assert.deepEqual(PROGRAMS.map(p=>p.title),[
    '슬기로운 AI 윤리 생활','AIoT 스마트 가로등','똑똑한 드로잉 로봇',
    '절대 지지 않는 가위바위보','모두의 스마트팜','바이브코딩으로 만드는 아두이노 스마트팜'
  ]);
  assert.equal(new Set(PROGRAMS.map(p=>p.id)).size,6);
  for(const p of PROGRAMS){
    assert.deepEqual(p.sessions.map(x=>x.number),[1,2,3,4]);
    for(const c of p.sessions){
      assert.ok(Array.isArray(c.details)&&c.details.length>=3);
      assert.ok(c.details.every(x=>typeof x==='string'&&x.trim().length>5));
    }
  }
  assert.equal(PROGRAM_SOURCE.sourceFile,'AI부트캠프 교육프로그램 안내자료(1).hwpx');
  assert.ok(PROGRAM_SOURCE.notSpecified.includes('차시별 시수'));
});

test('no inferred fourth-session title for intermediate rock-paper-scissors robot',()=>{
  assert.equal(PROGRAMS[3].sessions[3].title,'');
  assert.ok(PROGRAMS[3].sessions[3].details.some(x=>x.includes('카미봇 반응 설정하기')));
  assert.ok(PROGRAMS[4].sessions[3].details.some(x=>x.includes('완성하고및')));
});

test('important source terms, age groups, safety and sequence remain present',()=>{
  const text=JSON.stringify(PROGRAMS);
  for(const term of [
    '디지털 발자국','환각(Hallucination)','[실습] 게이미피케이션',
    '데이터 편향','티처블머신','Which Face is Real','캔바',
    '엔트리(Entry)','브레드보드','조도 센서','피에조 부저',
    '드로잉 로봇','디버깅','카미봇','클라우드 URL',
    'mBlock','토양수분','생장 LED','바이브코딩','LCD'
  ])assert.ok(text.includes(term),term);
  assert.equal(COURSE.lessons.length,4);
  assert.equal(COURSE.batches.length,6);
  assert.equal(COURSE.id,'mnu-staff-ai-2026');
});

test('program library is separate from the existing staff course and accessible from the requested entry route',()=>{
  const html=get('education/study/ai-bootcamp/programs/index.html');
  const js=get('education/study/ai-bootcamp/programs/programs.js');
  const css=get('education/study/ai-bootcamp/programs/programs.css');
  const home=get('education/study/ai-bootcamp/classroom.js');
  const entry=get('education/study/ai-bootcamp/index.html');
  assert.match(html,/src="\.\/programs\.js"/);
  assert.match(html,/href="\.\.\/"/);
  assert.match(html,/차시 전체 인쇄/);
  assert.match(html,/id="programPresentation"/);
  assert.match(home,/\.\/programs\/\?program=/);
  assert.match(entry,/href="\.\/programs\/"/);
  assert.match(js,/new URL\(window\.location\.href\)/);
  assert.match(js,/history\.replaceState/);
  assert.match(js,/textContent/);
  assert.match(js,/\.showModal\(\)/);
  assert.doesNotMatch(js,/\bfetch\s*\(|localStorage|sessionStorage|indexedDB|innerHTML|postMessage/);
  assert.doesNotMatch(html,/<script(?![^>]*src=)[^>]*>/i);
  assert.match(css,/@media print/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.doesNotMatch(html,/학생명단|개인 연락처|내역 업로드/);
});
