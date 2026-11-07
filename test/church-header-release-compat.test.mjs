import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyChurchHeaderNavigation} from '../scripts/verify-church-header-navigation.mjs';

const newNav=[
  ['/ekodichurch/devotion/','매일묵상'],
  ['/ekodichurch/#worship','예배·방송'],
  ['/ekodichurch/notices/','공지사항'],
  ['/ekodichurch/schedule/','주요일정'],
  ['/ekodichurch/#together','함께하기'],
  ['/ekodichurch/my/','마이페이지']
];
const modernHome=()=>'<html><head><link href="church-compact-navigation.css"></head><body>'+
  '<nav id="main-nav" aria-label="주요 메뉴">'+
  newNav.map(([href,label])=>'<a href="'+href+'">'+label+'</a>').join('')+'</nav>'+
  '<main><section data-church-weekly></section><div data-church-notices></div>'+
  '<section data-church-shared-schedules></section></main>'+
  '<script src="church-section-nav.js" defer></script></body></html>';
const nested=()=>[
  "['예배안내','#worship']","['주보·PPT','#weekly-worship']",
  "['온라인 방송','#online']","['공동체','#community']",
  "['협력소식','#partner-news']","['오시는 길','#location']",
  "['참여·후원','/ekodichurch/together/']",
  "['큐티인 신청','/qtin/church']",
  'church-section-filtered',"window.addEventListener('hashchange',show)"
].join('\n');

test('SHA-reviewed five-PR Church six-menu preserves eight contextual destinations and controlled selection',()=>{
  const page=readFileSync(new URL('../sites/ekodi-church/index.html',import.meta.url),'utf8');
  const controller=readFileSync(new URL('../sites/ekodi-church/church-section-nav.js',import.meta.url),'utf8');
  const proof=verifyChurchHeaderNavigation(page,controller);
  assert.equal(proof.contract,'six-item-selected-content');
  assert.equal(proof.primaryItems,6);
  assert.equal(proof.contextItems,8);
});

test('six-item menu with full nested worship and Together destinations is accepted',()=>{
  const proof=verifyChurchHeaderNavigation(modernHome(),nested());
  assert.deepEqual(proof,{contract:'six-item-selected-content',primaryItems:6,contextItems:8});
});

test('never silently accept removed contextual actions, retired menu or missing previews',()=>{
  assert.throws(()=>verifyChurchHeaderNavigation(modernHome(),nested().replace("['협력소식','#partner-news']","")),/required contextual action/);
  assert.throws(()=>verifyChurchHeaderNavigation(modernHome().replace('data-church-notices','no-notices'),nested()),/notices/);
  assert.throws(()=>verifyChurchHeaderNavigation(modernHome().replace('church-section-nav.js','unknown.js'),nested()),/controller not loaded/);
  assert.throws(()=>verifyChurchHeaderNavigation(modernHome().replace('매일묵상','오늘의 삶'),nested()),/unapproved primary navigation/);
  assert.throws(()=>verifyChurchHeaderNavigation(modernHome().replace('/ekodichurch/#together','/ekodichurch/#community'),nested()),/unapproved primary navigation/);
  assert.throws(()=>verifyChurchHeaderNavigation(modernHome().replace('data-church-weekly','not-verified'),nested()),/worship content/);
  assert.throws(()=>verifyChurchHeaderNavigation(modernHome()+'<nav id="main-nav"></nav>',nested()),/duplicate primary navigation/);
});

test('legacy menu must keep the original worship action and date-scoped data',()=>{
  const sample='<nav id="main-nav"><a href="#weekly-worship">예배자료</a></nav><section data-church-weekly></section>';
  assert.equal(verifyChurchHeaderNavigation(sample).contract,'legacy-reviewed');
  assert.throws(()=>verifyChurchHeaderNavigation(sample.replace('data-church-weekly','data-missing')),/worship editor/);
  assert.throws(()=>verifyChurchHeaderNavigation(sample.replace('예배자료','마이페이지')),/unapproved primary navigation/);
});
