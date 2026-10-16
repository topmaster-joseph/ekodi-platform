// EKODI Proposal Studio foundation. Pure module shared by browser editor and tests.
// All evidence, financial values, deadlines and commitments originate from the user or verified sources.
export const PROPOSAL_DOMAINS=Object.freeze([
  {id:'auto',name:'자동 분류'},
  {id:'public',name:'공공정책·지역발전'},
  {id:'business',name:'기업·창업·투자'},
  {id:'education',name:'교육·연구'},
  {id:'nonprofit',name:'비영리·사회적경제'},
  {id:'mission',name:'교회·선교·공동체'},
  {id:'technology',name:'기술·정보화'},
  {id:'general',name:'일반 제안'}
]);
export const PROPOSAL_GOALS=Object.freeze([
  {id:'proposal',name:'일반 제안서'},
  {id:'funding',name:'공모·지원사업'},
  {id:'pitch',name:'투자유치·발표'},
  {id:'bid',name:'입찰·기관 제출'}
]);
const GENERAL=Object.freeze([
  ['summary','제안 개요','제안의 핵심과 수혜자를 정의'],
  ['problem','현황과 문제','검증된 사실과 해석을 구분하여 서술'],
  ['objectives','목적과 목표','목표·기간·측정 지표를 명확히 정리'],
  ['strategy','추진 전략','대안, 선택 근거, 차별성'],
  ['execution','세부 실행계획','누가 무엇을 언제 어떻게 수행하는지'],
  ['budget','예산과 자원','확정된 금액과 미확정 비용을 구분'],
  ['governance','추진체계','책임·협력·위험 관리'],
  ['outcomes','성과와 기대효과','검증 가능한 목표와 평가 방법'],
  ['sources','근거와 출처','자료명·발행기관·기준기간·원문 URL']
]);
const DOMAIN_EXTRA=Object.freeze({
  public:[['policy','정책·제도 정합성','관련 상위 계획과 추진 근거']],
  business:[['market','시장과 고객','검증 가능한 시장·고객 근거'],['revenue','수익구조와 재무','매출·비용·가정의 구분']],
  education:[['curriculum','교육·연구 방법','과정·대상·평가·연구윤리']],
  nonprofit:[['impact','사회적 가치','수혜 대상과 성과 측정 방식']],
  mission:[['community','공동체 협력','참여·보호·책임·지속가능성']],
  technology:[['architecture','기술 구조와 보안','기능 범위·보안·운영·유지보수']],
  general:[]
});
export const PROPOSAL_STAGES=Object.freeze([
  {id:1,name:'자료 구조 분석',when:'sources'},
  {id:2,name:'제출 양식 분석',when:'form'},
  {id:3,name:'데이터 분석',when:'data'},
  {id:4,name:'부족정보 분석',when:'always'},
  {id:5,name:'외부 근거 조사',when:'research'},
  {id:6,name:'전략 후보 비교',when:'always'},
  {id:7,name:'사용자 의사결정',when:'always'},
  {id:8,name:'기초자료 작성',when:'always'},
  {id:9,name:'예산·성과 분석',when:'always'},
  {id:10,name:'제출 문서 제작',when:'always'},
  {id:11,name:'제출 문서 검토',when:'always'},
  {id:12,name:'발표자료 설계',when:'presentation'},
  {id:13,name:'PPTX 제작',when:'presentation'},
  {id:14,name:'발표 스크립트',when:'presentation'},
  {id:15,name:'발표 연습 음성',when:'presentation'},
  {id:16,name:'최종 산출물 검증',when:'always'}
]);
export function normalizeReferenceUrl(value){
  const raw=String(value??'').trim();
  if(!raw||raw.length>1200)throw new Error('웹주소는 1~1200자 이내로 입력하세요.');
  let url;
  try{url=new URL(raw);}catch{throw new Error('유효한 HTTPS 웹주소가 아닙니다.');}
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password){
    throw new Error('사용자정보 없는 HTTPS 주소만 입력할 수 있습니다.');
  }
  if(url.hostname==='localhost'||url.hostname.endsWith('.local')||/^127\./.test(url.hostname)){
    throw new Error('내부망·로컬 웹주소는 등록할 수 없습니다.');
  }
  url.hash='';
  return url.toString();
}
const ids=new Set(PROPOSAL_DOMAINS.map(item=>item.id));
const goals=new Set(PROPOSAL_GOALS.map(item=>item.id));
export function inferDomain(value=''){
  const text=String(value).slice(0,10000);
  if(/교회|선교|예배|교단|성경|목회/.test(text))return'mission';
  if(/교육|강의|학교|연구|논문|부트캠프|교수/.test(text))return'education';
  if(/프로그램|플랫폼|시스템|소프트웨어|개발|AI|인공지능|데이터베이스/.test(text))return'technology';
  if(/공공|지자체|관광|지역개발|정책|시민|행정|국립/.test(text))return'public';
  if(/사회적|협동조합|비영리|후원|봉사/.test(text))return'nonprofit';
  if(/투자|창업|매출|고객|수익|기업|납품|계약재배/.test(text))return'business';
  return'general';
}
export function selectedStages({sources=0,form=false,data=false,research=false,presentation=false}={}){
  return PROPOSAL_STAGES.filter(item=>item.when==='always'||(item.when==='sources'&&sources>0)||(item.when==='form'&&form)||(item.when==='data'&&data)||(item.when==='research'&&research)||(item.when==='presentation'&&presentation));
}
export function createProposalDraft({title,idea='',domain='auto',goal='proposal',sourceNames=[]}={}){
  const cleanTitle=String(title||'').trim().slice(0,160);
  const cleanIdea=String(idea||'').trim().slice(0,20000);
  if(!cleanTitle&&!cleanIdea)throw new Error('제안 주제 또는 아이디어가 필요합니다.');
  const selected=ids.has(domain)?domain:'auto';
  const finalDomain=selected==='auto'?inferDomain(cleanTitle+' '+cleanIdea):selected;
  const finalGoal=goals.has(goal)?goal:'proposal';
  const entries=[...GENERAL,...(DOMAIN_EXTRA[finalDomain]||[])];
  const sections=entries.map(([id,name,guide])=>({id,name,guide,body:''}));
  return {
    schema:'ekodi.proposal.draft.v1',version:1,
    title:cleanTitle||cleanIdea.split(/[\n.!?]/)[0].slice(0,80),
    idea:cleanIdea,domain:finalDomain,goal:finalGoal,
    phase:'working_draft',sections,
    sources:sourceNames.slice(0,20).map(item=>({name:String(item).slice(0,String(item).startsWith('https://')?1200:240),verification:'not_verified'})),
    decisions:{period:'',totalBudget:'',owner:'',target:'',measures:''}
  };
}
export function reviewProposalDraft(model){
  if(!model||model.schema!=='ekodi.proposal.draft.v1')throw new Error('지원하지 않는 프로젝트 형식입니다.');
  const issues=[];
  if(!String(model.title||'').trim())issues.push('사업명 또는 제안 주제가 비어 있습니다.');
  if(!Array.isArray(model.sections)||model.sections.length===0)issues.push('작성할 항목이 없습니다.');
  else for(const part of model.sections){if(!String(part.body||'').trim())issues.push(part.name+' 내용이 비어 있습니다.');}
  for(const [key,label] of Object.entries({period:'사업기간',totalBudget:'총사업비',owner:'추진주체',target:'사업대상',measures:'성과지표'})){
    if(!String(model.decisions?.[key]||'').trim())issues.push(label+' 확인이 필요합니다.');
  }
  if((model.sources||[]).some(s=>s.verification!=='verified'))issues.push('첨부 또는 참고 자료의 사실·출처 검증이 남아 있습니다.');
  return {submissionReady:issues.length===0,issues,checked:issues.length===0?'초안 필드 충족. 대외 제출은 사람의 최종 확인 필요.':'제출 전 검토 필요'};
}
function safeText(value){return String(value??'').replace(/\u0000/g,'').slice(0,50000);}
export function draftToMarkdown(model){
  reviewProposalDraft(model);
  const lines=['# '+safeText(model.title),'','> EKODI 제안서 작업 초안 — 제출 전 근거·수치·권한 확인 필요','','## 제안 아이디어',safeText(model.idea)||'입력된 아이디어 없음',''];
  for(const [id,label] of Object.entries({period:'사업기간',totalBudget:'총사업비',owner:'추진주체',target:'사업대상',measures:'성과지표'}))lines.push('- '+label+': '+(safeText(model.decisions?.[id])||'확인 필요'));
  lines.push('');
  for(const part of model.sections||[]){lines.push('## '+safeText(part.name),'',safeText(part.body)||'작성 내용 확인 필요','');}
  lines.push('## 참고자료 상태','','');
  for(const item of model.sources||[])lines.push('- '+safeText(item.name)+' ('+(item.verification==='verified'?'검증됨':'검증 전')+')');
  return lines.join('\n')+'\n';
}
export function validImportedDraft(data){
  return Boolean(data&&typeof data==='object'&&data.schema==='ekodi.proposal.draft.v1'&&Array.isArray(data.sections)&&data.sections.length>0&&data.sections.length<=30&&data.sections.every(s=>typeof s.id==='string'&&typeof s.name==='string'&&typeof s.body==='string'&&s.body.length<=50000)&&typeof data.title==='string'&&data.title.length<=160&&data.decisions&&typeof data.decisions==='object');
}
