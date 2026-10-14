// EKODIBIZ is the sole prospective contracting/payment subject. The AI surface only receives review requests.
// Fees must be approved by the merchant's versioned server configuration, never inferred from a browser.
export const ASSISTANCE_PLANS=Object.freeze([
  {id:'information',label:'공고·신청조건 안내',description:'공고 원문, 신청대상, 마감일 및 확인할 기관 연락처를 정리합니다.',deliverables:['공고 핵심요약','확인사항 체크리스트'],limitations:'공고 안내이며 개별 자격확정·대행·선정 보장은 포함하지 않습니다.',free:true},
  {id:'eligibility',label:'신청자격·요건 정밀 검토',description:'지원자격, 제외사유, 준비서류 및 부족한 요건을 검토합니다.',deliverables:['신청자격 검토표','준비서류 목록','보완 필요사항'],limitations:'최종 자격판정은 공고 주관기관이 합니다.'},
  {id:'document',label:'신청서·사업계획서 작성 지원',description:'기관의 공식 양식에 맞춰 신청서 및 사업계획서 초안을 준비합니다.',deliverables:['신청서 초안','사업계획서 초안','증빙자료 체크리스트'],limitations:'증빙서류의 사실 확인과 최종 제출은 신청자 책임입니다.'},
  {id:'submission',label:'신청 전 과정 동행',description:'일정관리, 서류검토, 보완요청 대응 및 제출 전 점검을 지원합니다.',deliverables:['신청 일정표','최종 제출 전 검토표','보완 대응안'],limitations:'신청·제출 대행은 별도 위임 및 신청자 최종 승인 후에만 가능합니다.'},
  {id:'presentation',label:'발표·평가 대비',description:'발표자료, 예상 질문과 답변, 발표 연습계획을 준비합니다.',deliverables:['발표자료 초안','예상 질문·답변','리허설 가이드'],limitations:'심사위원 평가 및 선정결과를 보장하지 않습니다.'},
  {id:'post-award',label:'선정 후 협약·수행·정산 관리',description:'협약 준비부터 집행·결과보고·정산 자료 정리를 지원합니다.',deliverables:['수행관리 일정표','증빙·지출 점검표','결과보고 초안'],limitations:'사업비 집행·협약·정산의 법적 책임 및 기관 승인 권한은 수행주체에 있습니다.'}
]);
const str=(v,n=180)=>String(v??'').trim().slice(0,n);
export function assistanceCatalogue(env={}){
  let raw={};try{raw=JSON.parse(String(env.EKODIBIZ_ASSISTANCE_PRICES_JSON||'{}'))}catch{}
  const approved=env.EKODIBIZ_ASSISTANCE_PRICES_APPROVED==='true';
  return ASSISTANCE_PLANS.map(plan=>{
    const fee=raw?.[plan.id];const valid=approved&&fee&&Number.isSafeInteger(fee.amount)&&fee.amount>=0&&fee.currency==='KRW'&&typeof fee.vatIncluded==='boolean'&&str(fee.policyVersion,50);
    return {...plan,price:plan.free?{amount:0,currency:'KRW',vatIncluded:true,policyVersion:'public-information',kind:'free'}:
      valid?{amount:fee.amount,currency:'KRW',vatIncluded:fee.vatIncluded,policyVersion:str(fee.policyVersion,50),kind:'fixed'}:
      {amount:null,currency:'KRW',vatIncluded:null,policyVersion:null,kind:'quote_required'}};
  });
}
export function assistanceSelection(planIds=[],catalog=assistanceCatalogue()){
  if(!Array.isArray(planIds)||planIds.length===0||planIds.length>6)throw new Error('plans_required');
  if(new Set(planIds).size!==planIds.length)throw new Error('duplicate_plan');
  const plans=planIds.map(id=>catalog.find(plan=>plan.id===id));
  if(plans.some(plan=>!plan))throw new Error('invalid_plan');
  const priceConfirmed=plans.every(plan=>plan.price.amount!==null);
  const amount=priceConfirmed?plans.reduce((sum,p)=>sum+p.price.amount,0):null;
  return{plans,priceConfirmed,amount,currency:'KRW',quoteRequired:!priceConfirmed};
}
export function normalizeAssistanceRequest(input={},catalog=assistanceCatalogue()){
  const clean=str;
  const noticeId=clean(input.noticeId,120),noticeTitle=clean(input.noticeTitle,250),noticeSource=clean(input.noticeSource,80);
  const applicantName=clean(input.applicantName,80),organization=clean(input.organization,150);
  const noticeUrl=clean(input.noticeUrl,1200);
  let verifiedUrl='';try{const url=new URL(noticeUrl);if(url.protocol==='https:'&&url.username===''&&url.password==='')verifiedUrl=url.toString()}catch{}
  if(!noticeId||!noticeTitle||!noticeSource||!verifiedUrl)throw new Error('official_notice_required');
  if(!applicantName||applicantName.length<2)throw new Error('applicant_name_required');
  if(input.scopeAcknowledged!==true||input.privacyAcknowledged!==true||input.precontractAcknowledged!==true)throw new Error('consent_required');
  const selected=assistanceSelection(input.planIds,catalog);
  return{noticeId,noticeTitle,noticeSource,noticeUrl:verifiedUrl,applicantName,organization,selected,
    legalVersion:'opportunity-assistance-request-v1',merchant:'EKODIBIZ',contractStatus:'merchant_review_required',
    // This is NOT a signed/binding contract or paid order. The merchant must approve price, terms, and execution.
    state:'review_requested'};
}
