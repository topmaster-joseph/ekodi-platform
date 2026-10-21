// FactChat(BAZE) feature reference for EKODI Education Live.
// EKODI does not re-implement FactChat. This file only describes official features and
// links learners to the institution's own FactChat site. Facts come from the official
// Mindlogic documentation; each entry keeps its source URL and the document's last-updated date.
// Institutional availability (menu visibility, credits, policy) is NOT verified by EKODI:
// every feature starts as 'needs-verification' until the instructor confirms it on the
// institution account before class (local, per-device confirmation only).

export const FACTCHAT_TOOL=Object.freeze({
  id:'factchat',
  name:'FactChat',
  vendor:'Mindlogic BAZE',
  // Official institutional entry the course targets. Learners sign in on FactChat's own domain.
  entryUrl:'https://mokpo.factchat.bot/dashboard/chat/40882',
  docsUrl:'https://docs.mindlogic.ai/docs/general/baze/getting-started/introduction',
  docsAsOf:'2026-09-28',
  integration:'link-out',
  integrationNote:'EKODI는 FactChat 계정·쿠키·API를 다루지 않습니다. 공식 사이트로 이동해 본인이 직접 로그인합니다.',
  sso:false,
  api:false
});

// status: 'needs-verification' = 공식 문서 확인, 기관 계정 실증 전 (확인필요)
export const FACTCHAT_FEATURES=Object.freeze([
  {id:'chat',label:'채팅하기',group:'채팅·검색',docUrl:'https://docs.mindlogic.ai/docs/general/baze/product/chat',docAsOf:'2026-09-28',
    where:'기본 채팅 화면',summary:'질문·지시문으로 문서 초안, 요약, 표 정리를 합니다.',pcOnly:false,credit:'모델별 크레딧 단가 적용(공식 문서 기준, 기관 정책 확인필요)'},
  {id:'hwp-editor',label:'HWP 문서 편집기',group:'콘텐츠 만들기',docUrl:'https://docs.mindlogic.ai/docs/general/baze/product/hwp-editor',docAsOf:'2026-09-30',
    where:'왼쪽 메뉴 「HWP 편집」 (기관이 허용한 경우에만 보임 · 기관 화면의 메뉴 위치 확인필요)',
    summary:'.hwp/.hwpx 열기 또는 「새 문서 만들기」 → AI 편집 지시 → 「편집 기록」으로 되돌리기 → 「파일」 메뉴에서 HWP·HWPX·PDF로 저장.',
    pcOnly:true,credit:'요청마다 사용량 기반 차감, 응답 아래에 사용량 표시'},
  {id:'meeting-notes',label:'회의록',group:'콘텐츠 만들기',docUrl:'https://docs.mindlogic.ai/docs/general/baze/product/meeting-notes',docAsOf:'2026-09-23',
    where:'왼쪽 메뉴 「회의록」 → 「+ 새 회의」',
    summary:'「녹음 시작」 또는 오디오 업로드(MP3·WAV·M4A·MP4, 회의당 최대 2시간·파일당 최대 200MB) → 개요·주요 논의·결정 사항·액션 아이템 요약과 화자별 대화록 → TXT/Markdown 다운로드.',
    pcOnly:false,credit:'녹음·업로드 1분당 약 6크레딧(공식 문서 기준)'},
  {id:'presentation',label:'프레젠테이션',group:'콘텐츠 만들기',docUrl:'https://docs.mindlogic.ai/docs/general/baze/product/presentation',docAsOf:'2026-10-12',
    where:'「콘텐츠 만들기」 → 「프레젠테이션」',
    summary:'주제 입력 → 「슬라이드 수」(직접 입력 1~100장)·「세부 설정」·템플릿 선택 → 「편집」으로 직접 수정 → 「내보내기」에서 PPTX/PDF.',
    pcOnly:false,credit:'슬라이드 1장당 약 50크레딧(공식 문서 기준) · 5장 약 250크레딧 추정'},
  {id:'deep-research',label:'Deep Research',group:'채팅·검색',docUrl:'https://docs.mindlogic.ai/docs/general/baze/product/deep-research',docAsOf:'2026-10-12',
    where:'사이드바 「Deep Research」',
    summary:'주제 입력 → 조사 계획 확인·수정 → 「리서치 시작」 → 출처가 달린 보고서(최대 30쪽) → PDF·DOCX·HTML 내보내기.',
    pcOnly:false,credit:'일반 채팅보다 많이 사용(공식 문서 기준, 정확한 단가 확인필요)'},
  {id:'univ-in-data',label:'Univ-in-Data',group:'데이터 분석',docUrl:'https://docs.mindlogic.ai/docs/general/baze/product/univ-in-data',docAsOf:'2026-08-06',
    where:'왼쪽 메뉴 「Univ-in-Data」',
    summary:'대학 공시 데이터(학과·입학·학사·등록금·연구비 등)를 대화로 비교·분석, 답변의 인용 원문 확인.',
    pcOnly:false,credit:'질문 1회 225크레딧(공식 문서 기준)'},
  {id:'korea-in-data',label:'Korea-in-Data',group:'데이터 분석',docUrl:'https://docs.mindlogic.ai/docs/general/baze/product/korea-in-data',docAsOf:'확인필요',
    where:'왼쪽 메뉴 「Korea-in-Data」 (기관 화면 확인필요)',summary:'국내 공공 데이터 기반 분석 도구(세부 범위는 공식 문서 확인필요).',pcOnly:false,credit:'확인필요'},
  {id:'law-in-data',label:'Law-in-Data',group:'데이터 분석',docUrl:'https://docs.mindlogic.ai/docs/general/baze/product/law-in-data',docAsOf:'확인필요',
    where:'왼쪽 메뉴 「Law-in-Data」 (기관 화면 확인필요)',summary:'법령 데이터 기반 분석 도구(세부 범위는 공식 문서 확인필요). 법적 판단은 담당 부서·원문 확인 필수.',pcOnly:false,credit:'확인필요'},
  {id:'super-agent',label:'Super Agent',group:'채팅·검색',docUrl:'https://docs.mindlogic.ai/docs/general/baze/product/super-agent',docAsOf:'확인필요',
    where:'사이드바 「Super Agent」 (기관 화면 확인필요)',summary:'여러 단계 작업을 수행하는 에이전트 기능(세부 동작은 공식 문서 확인필요). 수업에서는 강사 시연만 권장.',pcOnly:false,credit:'확인필요'}
]);

export const FEATURE_STATUS=Object.freeze({
  'needs-verification':{label:'기관 계정 실증 대기 · 확인필요',tone:'pending'},
  'confirmed-local':{label:'오늘 강사 PC에서 확인됨 (이 기기 기록)',tone:'ok'},
  'unavailable-local':{label:'오늘 사용 불가 → 대체 실습',tone:'warn'}
});

export function featureById(id){return FACTCHAT_FEATURES.find(row=>row.id===id)||null;}
