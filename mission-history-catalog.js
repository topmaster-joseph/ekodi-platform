export const MISSION_HISTORY=Object.freeze([
  Object.freeze({id:'230928-international-student-chuseok',date:'2023-09-28',year:'2023',title:'유학생 명절행사',kind:'명절·교제',place:'',summary:'타지에서 명절을 보내는 유학생들과 함께 식사하고 교제하며 서로의 문화를 나눈 활동입니다.'}),
  Object.freeze({id:'231225-christmas',date:'2023-12-25',year:'2023',title:'성탄행사',kind:'성탄·교제',place:'',summary:'성탄의 기쁨을 함께 나누며 유학생과 지역 이웃을 환대했던 공동체 행사입니다.'}),
  Object.freeze({id:'2024-summer-camp',date:'2024',year:'2024',title:'여름캠프',kind:'캠프',place:'',summary:'함께 머물고 이야기하며 신앙과 관계를 깊게 한 여름 공동체 캠프입니다.'}),
  Object.freeze({id:'251127-migrant-mission-seminar',date:'2025-11-27',year:'2025',title:'이주민 선교세미나',kind:'선교·세미나',place:'목포극동방송 4층 세미나실',summary:'지역의 이주민 선교를 함께 배우고 연결하기 위한 세미나를 진행했습니다.'}),
  Object.freeze({id:'251220-briquette-service',date:'2025-12-20',year:'2025',title:'연탄봉사',kind:'봉사',place:'',summary:'겨울철 지역 이웃의 필요를 함께 살피며 연탄 나눔 봉사를 진행했습니다.'}),
  Object.freeze({id:'251225-christmas',date:'2025-12-25',year:'2025',title:'성탄행사',kind:'성탄·교제',place:'',summary:'성탄을 맞아 이웃과 함께 식사하고 교제하며 환대의 시간을 가졌습니다.'}),
  Object.freeze({id:'260824-jeju-summer-camp',date:'2026-08-24 ~ 2026-08-27',year:'2026',title:'제주 여름캠프',kind:'캠프',place:'제주',summary:'5개국 유학생 7명이 3박 4일 동안 신앙·공동체·문화 체험을 함께했으며 안전사고 없이 일정을 마쳤습니다.'})
]);

export function missionHistoryPublicSnapshot(){return MISSION_HISTORY.map(item=>({...item}));}
