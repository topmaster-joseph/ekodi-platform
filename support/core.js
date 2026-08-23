export const SUPPORT_STAGES = Object.freeze(['discovery','fit-review','application-prep','submitted','document-review','presentation','selected','agreement','execution','mid-review','change-control','final-report','settlement','completed','follow-up']);

export function nextStage(stage){const i=SUPPORT_STAGES.indexOf(stage);return i<0?SUPPORT_STAGES[0]:SUPPORT_STAGES[Math.min(i+1,SUPPORT_STAGES.length-1)];}

export function normalizeText(value){return String(value||'').replace(/\s+/g,' ').trim();}

export function analyzeGuidanceChange(previous,current){
  const before=normalizeText(previous); const after=normalizeText(current);
  if(!before&&!after)return {kind:'UNCHANGED',changed:false,impact:'none',action:'none',deadline:null,document:null};
  if(!before&&after)return {kind:'NEW',changed:true,impact:'review-required',action:'review-new-guidance',deadline:extractDeadline(after),document:extractDocument(after)};
  if(before===after)return {kind:'UNCHANGED',changed:false,impact:'none',action:'none',deadline:extractDeadline(after),document:extractDocument(after)};
  const previousTokens=new Set(before.split(' '));
  const added=after.split(' ').filter(token=>!previousTokens.has(token));
  return {kind:'CHANGED',changed:true,impact:added.length?'possible-project-impact':'review-required',action:'compare-and-confirm',deadline:extractDeadline(after),document:extractDocument(after),added:added.slice(0,30)};
}

function extractDeadline(text){const match=text.match(/(20\d{2}[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2}|\d{1,2}월\s?\d{1,2}일)/);return match?match[1]:null;}
function extractDocument(text){const keywords=['사업계획서','신청서','협약서','결과보고서','정산보고서','증빙자료','발표자료','수행계획서'];return keywords.find(k=>text.includes(k))||null;}

export function scoreOpportunity(profile={},notice={}){
  const checks=[
    ['region',notice.region],['industry',notice.industry],['businessType',notice.businessType],['employeeBand',notice.employeeBand]
  ];
  let applicable=0, matched=0;
  for(const [key,rule] of checks){if(!rule)continue;applicable++;if(Array.isArray(rule)?rule.includes(profile[key]):normalizeText(rule)===normalizeText(profile[key]))matched++;}
  const base=applicable?Math.round(matched/applicable*80):50;
  const readiness=['businessName','registrationNumber','summary','recentRevenue'].reduce((n,key)=>n+(profile[key]?1:0),0)*5;
  return Math.min(100,base+readiness);
}

export function fillOfficialForm(schema=[],profile={},project={}){
  return schema.map(field=>{
    const key=field.key;
    const source=Object.prototype.hasOwnProperty.call(project,key)?'project':Object.prototype.hasOwnProperty.call(profile,key)?'profile':'missing';
    const value=source==='project'?project[key]:source==='profile'?profile[key]:'';
    return {...field,value,source,needsHumanReview:field.highImpact===true||source==='missing'};
  });
}

export function buildNextActions(project={}){
  const stage=project.stage||'discovery';
  const map={
    discovery:['공식 공고문 확보','지원자격 확인'],
    'fit-review':['적합도 검토','중복수혜·제외조건 확인'],
    'application-prep':['공식 양식 확보','부족정보 보완','사업계획서 검수'],
    submitted:['접수증 보관','추가 공지 모니터링'],
    'document-review':['보완요청 확인','평가기준 재점검'],
    presentation:['발표자료 준비','예상질문 점검'],
    selected:['최종 선정 공문 확인','협약조건 검토'],
    agreement:['협약서 검수','자부담·의무사항 확인'],
    execution:['수행일정 관리','지출·성과 증빙 축적'],
    'mid-review':['중간보고 작성','변경사항 사전승인 확인'],
    'change-control':['변경승인 근거 보관','예산·일정 재검증'],
    'final-report':['결과보고서 작성','성과근거 연결'],
    settlement:['정산서류 검수','불인정 가능 지출 확인'],
    completed:['완료자료 보존','성과 프로필 반영'],
    'follow-up':['후속 지원사업 탐색']
  };
  return map[stage]||map.discovery;
}

export function requiresHumanGate(action){return ['submit','sign','agreement','payment','budget-change','settlement','withdraw'].includes(String(action||'').toLowerCase());}
