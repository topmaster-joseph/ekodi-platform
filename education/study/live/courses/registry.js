// Course registry for EKODI Education Live.
// Live-engine courses load their own data module on demand. Existing courses that already have their
// own classroom (the 4회차 × 6세트 bootcamp proposal) are listed and linked, never converted or overwritten.

export const COURSES=Object.freeze([
  {id:'mnu-factchat-2026',engine:'live',org:'국립목포대학교',title:'AI로 내 업무를 바꾸는 4시간',
    subtitle:'국립목포대학교 FactChat 실무 캠프',format:'2회 × 120분 · 개인 실습 120분',state:'운영 준비',
    load:()=>import('./mnu-factchat-2026.js'),loadNotes:()=>import('./mnu-factchat-2026.notes.js')},
  {id:'mnu-staff-ai-2026',engine:'classroom',org:'국립목포대학교 AI부트캠프사업단',title:'AI로 바꾸는 대학의 일',
    subtitle:'교직원 AI 부트캠프 (제안 과정)',format:'4회차 × 6세트 = 24회 · 48시간',state:'제안안 · 사업단 확정 전',
    href:'study/ai-bootcamp/'}
]);

export const DEFAULT_COURSE_ID='mnu-factchat-2026';
export const courseEntry=id=>COURSES.find(c=>c.id===id&&c.engine==='live')||COURSES.find(c=>c.id===DEFAULT_COURSE_ID);
