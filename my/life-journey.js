export const EKODI_LIFE_JOURNEY=Object.freeze({
  schemaVersion:2,
  scope:'all-people',
  orchestrator:'my',
  identityModel:'person-space-role',
  principle:'One person keeps agency and context while specialist EKODI services take over only the work they own.',
  stages:[
    {id:'admission',label:'입시',shortLabel:'Admission',state:'active',ownerService:'edu',route:'https://edu.ekodi.kr/admission',audience:'all',summary:'학교·과정 탐색부터 전형, 서류, 면접, 합격까지 Education 안에서 준비합니다.',capabilities:['discovery','eligibility','application','documents','interview','decision']},
    {id:'study',label:'학습·유학',shortLabel:'Study',state:'active',ownerService:'edu',route:'https://edu.ekodi.kr/study',audience:'all',summary:'국내 학습과 국내외 유학의 학업·생활 준비를 Education 안에서 이어갑니다.',capabilities:['learning','study-abroad','academic-life','mobility','scholarship']},
    {id:'career',label:'취업·진로',shortLabel:'Career',state:'active',ownerService:'work',route:'https://work.ekodi.kr/',audience:'all',summary:'개인 프로필, 채용 탐색, 지원, 기업 채용 흐름을 EKODI Work에서 연결합니다.',capabilities:['jobs','talent','recruiting','applications']},
    {id:'startup',label:'창업·사업',shortLabel:'Startup',state:'active',ownerService:'business',route:'https://business.ekodi.kr/',supportingServices:['biz','marketing','trade','mall'],audience:'all',summary:'창업을 선택하면 사업 운영, 마케팅, 거래, 판매까지 기존 EKODI 비즈니스 생태계로 이어갑니다.',capabilities:['startup','operations','marketing','trade','commerce']},
    {id:'settlement',label:'생활·정착',shortLabel:'Life',state:'active',ownerService:'community',route:'https://community.ekodi.kr/',supportingServices:['work','church','energy'],audience:'all',summary:'지역과 공동체 안에서 생활, 관계, 역할을 이어가되 특정 공동체 참여를 강제하지 않습니다.',capabilities:['community','local-life','relationships','events']}
  ],
  handoffs:[
    {from:'admission',to:'study',trigger:'admission-confirmed',mode:'suggest',consent:'required',samePlatform:true},
    {from:'study',to:'career',trigger:'career-preparation-relevant',mode:'suggest',consent:'required'},
    {from:'career',to:'startup',trigger:'user-chooses-startup',mode:'suggest',consent:'required'},
    {from:'career',to:'settlement',trigger:'employment-or-local-life-relevant',mode:'suggest',consent:'required'},
    {from:'startup',to:'settlement',trigger:'local-life-relevant',mode:'suggest',consent:'required'}
  ],
  safeguards:{
    foreignerOnly:false,
    stageIsOptional:true,
    noForcedLinearJourney:true,
    noAutomaticSensitiveInference:true,
    crossServicePrivateData:'explicit-contract-and-user-authorization',
    AI:'suggest-and-assist',
    humanDecision:'required-for-submission-and-high-impact-actions'
  }
});
