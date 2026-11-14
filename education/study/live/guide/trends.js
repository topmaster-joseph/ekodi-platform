// AI 이용 추이 — 도입 차시용 (강사 전용, 투사 화면 겸용). Sources and as-of dates are shown on screen.
// Checked 2026-11-14. Only figures from official releases or the original survey reports (via news coverage).
export const TRENDS_AS_OF='2026-11-14';
export const TRENDS=Object.freeze([
  {id:'chatgpt',title:'ChatGPT 주간 이용자',unit:'억 명',max:12,
    points:[['2024.8',2],['2025.2',4],['2025.10',8],['2026.2',9],['2026.9',12]],
    note:'1년 7개월 만에 3배(4억→12억). 2026.9 OpenAI DevDay 공식 발표 「1.2B weekly users」',
    source:'OpenAI 발표(DevDay 2026 Recap, 2026.9) · TechCrunch(2026.2)'},
  {id:'korea',title:'한국 국민 생성형 AI 경험률',unit:'%',max:100,
    points:[['2024',33.3],['2025',44.5]],
    note:'1년 새 11.2%p 증가 — 국민 10명 중 4.5명',
    source:'과기정통부 「2025 인터넷이용실태조사」(2026.3 발표) · 2024 값은 발표된 증가폭(11.2%p)으로 산출'},
  {id:'korea-q',title:'한국 생산가능인구 AI 사용률(분기)',unit:'%',max:100,
    points:[['2026 Q1',37.1],['2026 Q2',40.6]],
    note:'Q1 +6.4%p, Q2 +3.5%p 상승 — 전 세계 평균(18.8%)의 2배 이상',
    source:'Microsoft AI Economy Institute 「AI 확산 보고서」 2026 Q1·Q2'},
  {id:'univ',title:'대학 생성형 AI 활용 지침 채택',unit:'개교',max:60,
    points:[['2024.6',30],['2026.2',56]],
    note:'대학의 40%가 채택, 40%가 제정 검토 중',
    source:'한국대학교육협의회 「대학 총장 설문」(2024.6, 2026.2)'}
]);
export const TREND_FACTS=Object.freeze([
  {k:'63.0%',v:'생성형 AI를 이미 도입했거나 도입을 계획 중인 대학 (강의·학습 지원, 일반 행정, 상담·안내, 연구지원)',source:'한국교육정보화재단, 2026 교육정보화 콘퍼런스(2026.6)'},
  {k:'1위',v:'한국인이 가장 많이 쓴 생성형 AI는 ChatGPT',source:'과기정통부 「2025 부가통신사업 실태조사」(2026.6 발표)'}
]);
export const TREND_MESSAGE='모두가 이미 쓰고 있습니다. 업무 자료는 개인 계정이 아니라, 학교가 보안을 관리하는 기관형 AI(FactChat)에서.';
export const TREND_TALK=Object.freeze([
  '「ChatGPT 주간 이용자는 1년 7개월 만에 3배, 12억 명입니다.」',
  '「우리 국민 10명 중 4.5명이 써 봤고, 분기마다 빠르게 늘고 있습니다.」',
  '「대학도 63%가 이미 도입했거나 준비 중이고, 지침을 둔 대학은 2년 새 2배가 됐습니다.」',
  '「그래서 오늘은 개인 계정이 아니라 학교가 제공한 기관형 AI로, 업무에 바로 쓰는 법을 연습합니다.」',
  '목포대 FactChat 자체 이용 통계(월별 사용자·크레딧)는 기관 관리자 화면 제공 여부 확인필요 — 받으면 이 카드에 추가'
]);
