// MNU FactChat concentrated single-session workshop — additive course.
// Reuses the original four-hour course's vetted fictional materials, job tracks,
// levels, rubric and feature fallbacks without changing its source or schedules.
import {COURSE as BASE} from './mnu-factchat-2026.js';

const original=BASE.missions;
const missions=Object.freeze({
  hwp:Object.freeze({...original.hwp,
    minutes:25,
    title:'실습 ① HWP 안내문·공문 초안 (25분)',
    problem:'가상 대학 안내문을 HWP 또는 채팅으로 정리하고, 없는 정보는 [확인 필요]로 남깁니다.',
    why:'반복 안내문 초안에 쓰는 시간을 줄이고 확인·승인에 집중합니다.',
    steps:[
      '실습실에서 내 직무 분야를 고르고 [가상 실습자료] 원문을 복사합니다.',
      'FactChat 기관 계정의 HWP 편집 기능이 허용되면 새 문서에 ① 초안 프롬프트를 실행합니다. 메뉴가 없거나 모바일이면 일반 채팅을 사용합니다.',
      '② 편집 지시를 실행해 표와 문체를 다듬고, 원문과 날짜·숫자·담당을 대조합니다.',
      '자료에 없는 연락처·기한 등은 [확인 필요]로 남기고 승인 전까지 발송하지 않습니다.',
      '허용되는 경우 HWPX로 저장하고, 아니면 문서 초안과 프롬프트를 복사해 보관합니다.'
    ],
    expected:'원문과 대조한 안내문 1건(HWPX 또는 복사 가능한 초안).',
    deliverable:'안내문 초안 1건 + 확인 필요 항목'
  }),
  minutes:Object.freeze({...original.minutes,
    minutes:25,
    title:'실습 ② 회의록·담당·기한 정리 (25분)',
    problem:'가상 회의 대본을 확정/보류와 담당·기한 표로 바꿉니다.',
    steps:[
      '내 분야의 [가상 회의 대본]을 화면에서 읽고 TXT로 내려받거나 복사합니다. 실제 음성 전사본이 아닌 가상 대본입니다.',
      'TXT 경로: FactChat 일반 채팅에 TXT를 첨부하거나 본문을 붙여 넣습니다. 전용 회의록 메뉴는 음성파일 업로드·녹음용입니다.',
      '기관에서 회의록 녹음 기능이 허용된 경우에만 가상 대본을 녹음합니다. 실제 회의 녹음은 동의와 기관 정책 확인 후 가능합니다.',
      '① 정해진 일 표 프롬프트를 실행해 확정/보류·담당·기한·근거 문장을 표로 만듭니다.',
      '② 후속 업무 프롬프트로 5줄 이하 공유 메시지를 만들고 발송하지 않은 상태로 보관합니다.',
      '원문에 없던 결정, 담당자 바뀜, 상대 날짜 임의 변환이 있는지 확인합니다.',
      '실습 종료 즉시 각자의 FactChat 회의·채팅 기록, 내려받은 TXT·녹음 파일을 삭제하고 에코디에서 회의록 결과·메모를 삭제합니다.'
    ]
  }),
  ppt:Object.freeze({...original.ppt,
    minutes:20,
    title:'실습 ③ 3장 보고자료·수치 검증 (20분)',
    problem:'가상 보고자료 3장짜리 구조를 만들고 원문 밖의 숫자·퍼센트를 찾아냅니다.',
    why:'AI의 슬라이드 생성보다 더 중요한 것은 근거 없는 주장을 발견하는 일입니다.',
    steps:[
      '내 분야의 [가상 실습자료] 보고용 사실을 확인합니다.',
      'FactChat 「프레젠테이션」이 허용되고 크레딧 사용에 동의한다면 3장을 생성합니다. 비용·기능이 불확실하면 채팅에서 슬라이드 3장 문안만 만듭니다.',
      '① 생성 프롬프트로 현황·핵심 수치·후속조치 3장을 작성합니다.',
      '② 수정 지시로 두 번째 장의 숫자를 표로 바꾸고 원문을 다시 대조합니다.',
      '원문에 없는 증감률·확정 표현을 제거하고 PPTX 또는 슬라이드 문안을 저장합니다.'
    ],
    prompts:[
      {label:'① 3장 보고자료',build:t=>'「'+t.topic+'」를 주제로 대학 내부 보고자료 3장을 만들어 주세요. 1) 현황 2) 핵심 수치·근거 3) 후속조치. 아래 [가상 실습자료]에 없는 숫자, 비율, 일정은 만들지 말고 [확인 필요]로 표시해 주세요. 실제 PPT 생성 기능을 쓰지 못하면 슬라이드별 제목과 본문을 표로 작성해 주세요.\n\n'+t.facts},
      {label:'② 수치 검증·수정',build:()=>'두 번째 장의 수치를 「항목 | 수치 | 원문 근거 | 확인 결과」 표로 바꿔 주세요. 원문에 없는 비율·증감률은 삭제하고, 확정되지 않은 사항은 [확인 필요]로 표시해 주세요.'}
    ],
    expected:'원문 근거를 확인한 3장 슬라이드 또는 3장 문안.',
    deliverable:'3장 보고자료 또는 문안 + 수치 검증표',
    errors:['원문에 없는 비율·증감률이 생겼는가?','나눗셈의 분모가 맞는가?','보류·검토 중인 일이 확정으로 바뀌었는가?','원문에 없는 출처가 생겼는가?'],
    criteria:{
      basic:['3장 구성 완성','원문 수치 검증 완료','PPTX 또는 문안 저장'],
      intermediate:['표 변환과 원문 근거 표시','슬라이드별 목적이 명확함','3장 가독성 확인'],
      advanced:['주장-근거 점검표 작성','근거 없는 주장 제거','업무 보고 재사용 형태로 저장']
    },
    fallback:{...original.ppt.fallback,
      title:'대체 실습 · 3장 보고자료 오류 찾기',
      steps:['가상 AI 슬라이드와 원문을 비교해 잘못된 수치·증감률을 찾습니다.','3장 구성의 올바른 문안으로 수정합니다.','원문 기준 숫자 검증표를 작성합니다.']}
  }),
  free:Object.freeze({...original.free,
    minutes:20,
    title:'실습 ④ 내 업무 AI 비서 만들기 (20분)',
    problem:'7개 직무 분야 중 자신의 반복 업무를 골라 재사용할 프롬프트와 결과물 1건을 만듭니다.',
    steps:[
      '내 업무 중 반복적이고 저위험인 작업 1개를 정합니다.',
      '공개되었거나 가상·비식별 자료만 넣어 ① 프롬프트를 실행합니다.',
      '② 다듬기 프롬프트를 실행해 부서의 문체와 출력 형식을 맞춥니다.',
      '날짜·숫자·근거·개인정보·발송 승인 여부를 점검합니다.',
      '결과물과 재사용 프롬프트를 저장하고 30일 안에 적용할 일을 정합니다.'
    ],
    expected:'재사용 프롬프트 1개와 검증을 거친 업무 결과물 1건.',
    deliverable:'업무 결과물 1건 + 재사용 프롬프트'
  })
});

const modules=Object.freeze([
  Object.freeze({id:'short-hook',start:0,end:5,kind:'lecture',title:'AI를 써 봤는데, 내 일은 줄었나요?',
    hook:{q:'지난주에 가장 오래 걸린 반복 업무는 무엇입니까?',sub:'손들기 질문: AI를 써본 분 → 실제 업무에 써본 분 → 다시 쓰는 분'},
    summary:'AI 사용 자체가 아니라 업무 결과물의 정확성과 재사용을 목표로 합니다.',
    points:['손들기 퀴즈: 써봄 / 업무 활용 / 반복 재사용','가상·비식별 자료만 쓰고 자료 밖의 정보는 [확인 필요]','기존 원본 PPT 1~4: 도입·통계·교육 방향을 5분 이내로 압축'],
    learner:{headline:'내 업무 한 줄 적기',tasks:['최근 반복했던 공문·회의록·보고서 중 1개를 적습니다.','오늘 줄이고 싶은 시간을 메모합니다.']}}),
  Object.freeze({id:'short-basics',start:5,end:12,kind:'lecture',title:'FactChat 7분 시작과 좋은 질문 공식',
    summary:'FactChat 접속, 목표·맥락·조건·출력·검증의 5요소를 첫 질문에 적용합니다.',
    points:['기관 승인 FactChat 계정 접속, 미허용 기능은 일반 채팅으로 대체','나쁜 질문: 안내문 써줘 → 좋은 질문: 원문만 사용·표·250자·없는 사실 표시','학생·인사·미공개 연구자료 입력 금지, 발송·공개 전 담당자 승인'],
    learner:{headline:'첫 질문 실행',tasks:['FactChat 기관 계정으로 로그인합니다.','원본 PPT 8·10번의 가상 행사정보로 안내문을 작성하고 [확인 필요]를 찾습니다.']}}),
  Object.freeze({id:'short-hwp',start:12,end:37,kind:'practice',missionId:'hwp',title:'가상 안내문 1건 완성'}),
  Object.freeze({id:'short-minutes',start:37,end:62,kind:'practice',missionId:'minutes',title:'회의록 정해진 일 확인'}),
  Object.freeze({id:'short-ppt',start:62,end:82,kind:'practice',missionId:'ppt',title:'3장 보고자료·숫자 점검'}),
  Object.freeze({id:'short-free',start:82,end:102,kind:'practice',missionId:'free',title:'나만의 업무 AI 비서'}),
  Object.freeze({id:'short-review',start:102,end:113,kind:'review',title:'AI의 거짓말 찾기 · 결과물 한 장 공유',
    summary:'원문과 AI 결과를 맞대어 보류/확정·담당·숫자 오류를 찾아냅니다.',
    points:['가상 회의: 운영 연장은 보류였는데 확정으로 바뀌었는가?','가상 비교과: 신청 42명·참여 36명·수료 31명에서 수료율 92%가 맞는가?','틀린 내용 2가지를 수정하고 사실·수치·보안 검증표 완료','제출·공유는 자발적으로, 개인정보를 지운 뒤'],
    errorHunt:'eh-short',
    learner:{headline:'AI 오류 찾기',tasks:['회의록 요약의 결정·담당 오류를 찾습니다.','보고자료의 근거 없는 수치·비율을 찾아 수정합니다.']}}),
  Object.freeze({id:'short-plan',start:113,end:120,kind:'share',title:'내일 다시 쓰는 프롬프트 1개',
    summary:'수업에서 만든 결과물을 저장하고 30일 안에 반복 활용할 계획을 작성합니다.',
    points:['업무 1개 / 적용할 때 / 사용할 프롬프트 / 사람이 확인할 항목','실습 전·후 소요시간과 수정 횟수만 비교: 성과를 과장하지 않기','결과물과 프롬프트는 내 기기에서 저장하고, 기관 공유는 승인 후'],
    learner:{headline:'30일 실천 카드',tasks:['실제 적용할 반복 업무 1개와 사용할 기능을 적습니다.','개인 프롬프트·결과물을 내려받습니다.','최종 검증: 원문 사실·숫자·보안·승인을 확인합니다.']}})
]);

const ERROR=Object.freeze({
  id:'eh-short',title:'FactChat 오류 탐정: 네 가지를 찾아라',
  source:'[가상] 도서관 회의 · 비교과 결과',
  text:'[가상 AI 요약 · 오류 포함]\n① 도서관 야간 연장 운영이 확정되었다.\n② 시설팀 협의 담당은 주무관A다.\n③ 비교과 AI 취업 캠프: 참여 36명, 수료 31명, 수료율 92%.\n④ 참여자 만족도는 4.8점.',
  hint:'원문: 도서관 회의 대본(시설·도서관), 비교과 보고자료(학생지원). 확정 여부·담당·분모·만족도를 확인하세요.'
});

export const COURSE=Object.freeze({
  ...BASE,
  id:'mnu-factchat-120m-2026',
  title:'AI로 내 업무를 바꾸는 2시간',
  subtitle:'국립목포대학교 FactChat 실무 캠프 · 집중 실습',
  status:'단일 120분 집중 실습 과정 · 기관 일정·수료 기준 확인필요',
  audience:'국립목포대학교 교직원 · 7개 업무 분야 · 입문~심화',
  format:'1회 × 120분 · 개인 실습 90분(25+25+20+20)',
  missions,
  moods:Object.freeze({
    'short-hwp':BASE.moods['s1-p1'],
    'short-review':BASE.moods['s1-review'],
    'short-plan':BASE.moods['s2-plan']
  }),
  sessions:Object.freeze([Object.freeze({
    no:1,title:'FactChat 2시간 집중 실습 · 내 업무를 바로 바꾸는 120분',
    minutes:120,modules,
    outcomes:['안내문 초안 1건','회의록 정해진 일·담당·기한 표 1건','3장 업무 보고자료 또는 문안','재사용 프롬프트 1개와 30일 적용 계획']
  })]),
  errorHunts:Object.freeze([...BASE.errorHunts,ERROR])
});
