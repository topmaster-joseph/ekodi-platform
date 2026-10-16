import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {AUDIENCES,CONSULTING,buildPlan,planMarkdown,consultationDraft} from '../education/study/academy/catalog.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('five audience tracks and four consultation methods are available',()=>{
 assert.deepEqual(AUDIENCES.map(a=>a.id),['merchant','staff','resident','employee','student']);
 assert.ok(AUDIENCES.every(a=>a.modules.length===4&&a.modules.every(module=>module.length===5)));
 assert.equal(CONSULTING.length,4);
});

test('MNU-style 4 sessions times 6 sets remains possible without altering existing classroom',async()=>{
 const p=buildPlan({audience:'staff',title:'교직원 AI 실무',sessions:4,minutes:120,practicePercent:70,program:'AI부트캠프'});
 assert.equal(p.sessions,4);assert.equal(p.minutes,120);assert.equal(p.totalMinutes,480);
 assert.equal(p.lessons[0].title,'AI 리터러시와 프롬프트');
 assert.equal(p.lessons[3].checkpoint,'발송·삭제 승인');
 const classroom=await read('education/study/ai-bootcamp/index.html');
 assert.match(classroom,/4회/);assert.match(classroom,/6세트/);
});

test('funded course gets explicit sponsor, dates and tailored lesson titles, outcomes',()=>{
 const p=buildPlan({audience:'merchant',program:'소상공인 AI 역량 강화',host:'교육 위탁기관',title:'우리 가게 실습',topic:'홍보 중심',
 curriculum:'스마트폰 AI 기초\nSNS 홍보 콘텐츠\n리뷰 답변 실습',requirements:'개인별 실습물 1건',sessions:3,minutes:90,practicePercent:80,delivery:'hybrid',start:'2026-11-01',end:'2026-11-30'});
 assert.equal(p.program,'소상공인 AI 역량 강화');assert.equal(p.delivery,'혼합');
 assert.equal(p.lessons[1].title,'SNS 홍보 콘텐츠');
 assert.match(p.lessons[1].prompt,/SNS 홍보 콘텐츠/);
 assert.equal(p.practical,72);assert.equal(p.totalMinutes,270);
 const md=planMarkdown(p);
 assert.match(md,/개인별 실습물 1건/);assert.match(md,/2026-11-01/);assert.match(md,/실습 프롬프트/);
});

test('numbers are bounded for safe small and large educational events',()=>{
 const p=buildPlan({audience:'unknown',sessions:1000,minutes:999,practicePercent:999});
 assert.equal(p.sessions,24);assert.equal(p.minutes,240);assert.equal(p.practicePercent,85);
 assert.equal(p.lessons.length,24);
 const short=buildPlan({sessions:-3,minutes:1,practicePercent:1});
 assert.equal(short.sessions,1);assert.equal(short.minutes,40);assert.equal(short.practicePercent,40);
});

test('consulting drafts explicitly do not claim a confirmed booking',()=>{
 const doc=consultationDraft({type:'institution',audience:'resident',program:'지역주민 AI 과정',question:'무안군민 교육',delivery:'online'});
 assert.match(doc,/기관·지원사업 교육설계/);assert.match(doc,/지역주민/);
 assert.match(doc,/실제 예약이나 제출이 아닙니다/);
});

test('public academy uses same-origin scripts and protects personal data on first release',async()=>{
 const html=await read('education/study/academy/index.html');
 const script=await read('education/study/academy/academy.js');
 const style=await read('education/study/academy/academy.css');
 const catalog=await read('education/study/academy/catalog.js');
 assert.match(html,/href="\.\/academy\.css"/);
 assert.match(html,/src="\.\/academy\.js"/);
 assert.match(html,/온라인 교육·컨설팅 안내/);
 assert.match(html,/id="curriculum"/);
 assert.match(html,/id="presentationDialog"/);
 assert.doesNotMatch(html,/<script(?![^>]*src=)[^>]*>/);
 assert.doesNotMatch(html,/\sonclick=|<style[\s>]/);
 assert.doesNotMatch(script+catalog,/localStorage|sessionStorage|fetch\s*\(|service_role|apikey|supabase/i);
 assert.match(script,/URL\.createObjectURL/);
 assert.match(script,/dialog\.showModal\(\)/);
 assert.match(style,/@media\(max-width:560px\)/);
 for(const path of ['education/study/academy/academy.js','education/study/academy/catalog.js'])
  execFileSync(process.execPath,['--check',fileURLToPath(new URL('../'+path,import.meta.url))],{stdio:'pipe'});
});

test('Education home and Study retain existing routes and link the academy',async()=>{
 const home=await read('education/index.html'),study=await read('education/study/index.html');
 assert.match(home,/TWO AREAS · ONE EDUCATION CONTEXT/);
 assert.match(home,/href="\/study\/academy\/"/);
 assert.match(study,/href="\/study\/ai-bootcamp\/"/);
 assert.match(study,/href="\/study\/academy\/#consulting"/);
});
