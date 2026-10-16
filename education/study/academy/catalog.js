// EKODI Education Academy — public, synthetic-only curriculum models.
// Does not submit applications, enroll participants, record attendance or book consultations.
export const AUDIENCES=Object.freeze([
 {id:'merchant',name:'소상공인',sub:'가게·상권·매출',case:'가상의 동네 상점',modules:[
  ['가게 현황과 AI 기초','가상 매장 안내문 개선','고객이 이해하기 쉬운 150자 안내문을 작성하고 확인되지 않은 사실은 [확인 필요]로 남겨 주세요.','홍보문안','과장 광고 없음'],
  ['사진·홍보·콘텐츠','SNS 콘텐츠 3컷 기획','가상 카페의 홍보 카드뉴스 3컷 구성과 대체텍스트를 제안해 주세요. 실제 고객 정보는 넣지 마세요.','콘텐츠 기획안','이미지 사용권 확인'],
  ['리뷰와 고객응대','고객 불편 후기 응대','가상 지연 배송 후기에 공감하는 답변을 작성하되 확인되지 않은 보상 약속은 하지 마세요.','응대문 2종','개인정보 미입력'],
  ['매출분석과 개선','가상 판매표 분석','요일별 가상 판매량 12,9,14,11,19,21,16의 합계와 평균을 계산하고 검산 절차를 제안하세요.','30일 개선계획','합계 102 검산']
 ]},
 {id:'staff',name:'교직원',sub:'대학·행정·연구지원',case:'가상의 대학 교육지원 업무',modules:[
  ['AI 리터러시와 프롬프트','가상 행사용 안내문 생성','제공된 행사의 일정과 장소만 사용하고 없는 연락처와 신청주소는 [확인 필요]로 표시하세요.','업무 프롬프트와 검증표','공식 근거 대조'],
  ['행정문서·데이터 검산','회의 결정사항 표 만들기','가상 회의 메모를 결정사항·담당·기한 표로 정리하고 원본과 대조하세요.','회의록과 검산표','날짜·숫자 재검산'],
  ['교수학습·연구지원','평가 루브릭 설계','가상 과제에 대한 평가기준 4개를 작성하고 출처·공정성·AI 사용범위를 명시하세요.','루브릭과 수업안','비공개 연구자료 금지'],
  ['업무자동화와 책임','승인형 업무 흐름 설계','가상 FAQ 업무에 대해 입력·검토·승인·실행·복구 단계를 만들고 개인정보 처리를 제외하세요.','30일 자동화 제안','발송·삭제 승인']
 ]},
 {id:'resident',name:'지역주민·무안군민',sub:'스마트폰·생활문제 해결',case:'가상의 생활 안내 상황',modules:[
  ['스마트폰과 안전한 AI','생활 질문 연습','생활정보를 질문하는 프롬프트를 만들고 추정·광고·공식 안내를 구분하세요.','나의 안전 사용 수칙','비밀번호 공유 금지'],
  ['공공정보 확인','지역 행사 정보 검증','가상의 지역 행사 안내에서 날짜·장소·접수처의 공식 출처 확인표를 만드세요.','정보 확인표','공식 웹사이트 확인'],
  ['사진·문서 활용','생활문서 작성','동네 모임 안내문을 150자로 쓰고 보기 쉬운 제목과 쉬운 문장을 사용하세요.','안내문 1건','저작권·초상권 확인'],
  ['생활 프로젝트','나에게 필요한 AI 활용','가상의 반복적인 생활문제 하나를 골라 7일 실천계획과 점검표를 작성하세요.','7일 실천계획','실행 가능성 점검']
 ]},
 {id:'employee',name:'재직자',sub:'보고서·데이터·업무개선',case:'가상의 사내 업무 개선 과제',modules:[
  ['AI 생산성 시작','반복업무 찾기','가상 부서의 반복업무 3개를 빈도·시간·위험도로 분류해 주세요.','업무 진단표','기밀 제외'],
  ['문서와 보고서','보고서 구조 설계','가상 분기 성과 메모만 활용해 핵심지표와 확인 필요 항목을 나눈 보고서 틀을 만드세요.','보고서 초안','수치 검산'],
  ['엑셀·데이터','업무 데이터 분석','가상 판매량 표의 평균과 증감률 계산법을 수식과 함께 제시하고 이중 검산하세요.','분석표','원본 일치'],
  ['AI 에이전트 실습','승인형 자동화 설계','가상 반복업무의 입력·AI 보조·담당자 승인·실패시 복구 흐름을 작성해 주세요.','업무 개선안','외부 발송 전 승인']
 ]},
 {id:'student',name:'학생',sub:'학습·발표·진로·프로젝트',case:'가상의 팀 프로젝트',modules:[
  ['학습 AI와 정보검증','자료 요약과 출처','가상 학습자료를 요약하고 확인하지 못한 출처를 만들지 않도록 점검표를 작성하세요.','학습 노트','출처 조작 금지'],
  ['과제와 발표 설계','5분 발표 구조 만들기','가상 프로젝트 발표의 문제·근거·해결·한계·질문 순서로 5분 개요를 작성하세요.','발표안','AI 도움 표시'],
  ['자료·데이터 해석','가상 실험 결과 해석','가상의 조사 결과에서 표본과 한계를 밝히고 과장 없는 결론을 작성하세요.','근거표','결론 과장 금지'],
  ['진로·포트폴리오','프로젝트 성과 정리','가상 팀 프로젝트의 역할·실행·검증·배운 점을 자기소개용으로 정리하세요.','포트폴리오 초안','허위 실적 금지']
 ]}
]);
export const FORMATS=Object.freeze([{id:'online',name:'온라인'},{id:'onsite',name:'대면'},{id:'hybrid',name:'혼합'}]);
export const CONSULTING=Object.freeze([
 {id:'orientation',name:'교육 도입 상담',duration:'20~30분',description:'교육 수요·난이도·기기·운영 방식 진단'},
 {id:'workshop',name:'현장 실습 컨설팅',duration:'60분',description:'업무·매장 문제를 함께 분석하고 실습안을 제안'},
 {id:'institution',name:'기관·지원사업 교육설계',duration:'90분',description:'공모요건·성과지표·예산·일정에 맞춘 사업형 교육 설계'},
 {id:'followup',name:'교육 후 적용 코칭',duration:'30~60분',description:'과제·활용률·성과·추가 개선점 검토'}
]);
const safe=(v,max=180)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const number=(v,min,max,fallback)=>{const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):fallback;};
export function audienceFor(id){return AUDIENCES.find(a=>a.id===id)||AUDIENCES[0];}
export function buildPlan(input={}){
 const audience=audienceFor(input.audience),sessions=number(input.sessions,1,24,4),minutes=number(input.minutes,40,240,120),practicePercent=number(input.practicePercent,40,85,70);
 const title=safe(input.title,100)||audience.name+' AI 실습교육';
 const program=safe(input.program,120)||'자체·위탁 교육',host=safe(input.host,100)||'기관 협의 전',topic=safe(input.topic,180)||audience.sub;
 const delivery=FORMATS.find(row=>row.id===input.delivery)||FORMATS[0],start=safe(input.start,10),end=safe(input.end,10);
 const requirements=safe(input.requirements,400),customTopics=String(input.curriculum??'').split(/\\r?\\n/).map(item=>safe(item,120)).filter(Boolean).slice(0,24);
 const practical=Math.round(minutes*practicePercent/100),theory=minutes-practical;
 const lessons=Array.from({length:sessions},(_,i)=>{const module=audience.modules[i%audience.modules.length],custom=customTopics[i];return {number:i+1,title:custom||module[0],scenario:module[1],prompt:custom?'이번 회차 주제는 '+custom+'입니다. '+module[2]:module[2],artifact:module[3],checkpoint:module[4],focus:topic,minutes,practiceMinutes:practical};});
 return {audience:audience.name,audienceId:audience.id,title,program,host,topic,requirements,delivery:delivery.name,start,end,sessions,minutes,practicePercent,practical,theory,totalMinutes:minutes*sessions,lessons,provisional:true};
}
export function planMarkdown(p){
 const lines=['# '+p.title,'','- 대상: '+p.audience,'- 사업·지원사업: '+p.program,'- 의뢰·주관기관: '+p.host,'- 주제: '+p.topic,'- 형식: '+p.delivery,'- 기간: '+(p.start||'미정')+' ~ '+(p.end||'미정'),'- 총 '+p.sessions+'회 × '+p.minutes+'분 ('+p.totalMinutes+'분)','- 실습 비율: '+p.practicePercent+'% ('+p.practical+'분/회)','- 상태: 교육 설계 초안 · 사업 확정안 아님','- 성과·납품 요건: '+(p.requirements||'기관 협의 후 확정'),'','## 회차별 운영안'];
 for(const lesson of p.lessons)lines.push('','### '+lesson.number+'회차 · '+lesson.title,'- 실습 상황: '+lesson.scenario,'- 실습 결과물: '+lesson.artifact,'- 검증: '+lesson.checkpoint,'- 실습 프롬프트: '+lesson.prompt);
 lines.push('','## 운영·보안','- 가상자료만 공개 사용하고 실제 개인정보·기밀은 별도 승인 없이 입력하지 않습니다.','- 출결·점수·증빙·수료증은 별도 인증된 운영 시스템 연결 전까지 생성·저장하지 않습니다.','- 기관 최종 승인 후 일정·강사료·지원사업 정산기준을 확정합니다.');
 return lines.join('\n');
}
export function consultationDraft(input={}){
 const option=CONSULTING.find(c=>c.id===input.type)||CONSULTING[0],audience=audienceFor(input.audience);
 return ['# EKODI 온라인 컨설팅 사전 문의 초안','', '상담 유형: '+option.name+' ('+option.duration+')','대상: '+audience.name,'기관 또는 사업: '+(safe(input.program)||'미정'),'해결하고 싶은 과제: '+(safe(input.question,600)||'사전 진단 필요'),'희망 진행방식: '+(FORMATS.find(f=>f.id===input.delivery)?.name||'온라인'),'','안내: 온라인 화상상담 일정·비용·계약은 별도 협의가 필요하며, 이 문서는 실제 예약이나 제출이 아닙니다.'].join('\n');
}
