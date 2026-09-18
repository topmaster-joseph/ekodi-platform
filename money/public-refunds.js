const VERIFIED_AT='2026-09-15';

export const PUBLIC_REFUND_SOURCES=Object.freeze([
  Object.freeze({id:'national-tax',group:'tax',name:'국세환급금',agency:'국세청',url:'https://www.nts.go.kr/',scope:'국세 환급금 조회',authRequired:true,apply:'official',priority:10,verifiedAt:VERIFIED_AT}),
  Object.freeze({id:'local-tax',group:'tax',name:'지방세 환급',agency:'위택스',url:'https://www.wetax.go.kr/',scope:'지방세 과오납·환급 확인',authRequired:true,apply:'official',priority:20,verifiedAt:VERIFIED_AT}),
  Object.freeze({id:'health-refund',group:'social',name:'건강보험 환급금',agency:'국민건강보험',url:'https://www.nhis.or.kr/nhis/index.do',scope:'건강보험 환급금·본인부담상한 관련 조회',authRequired:true,apply:'official',priority:30,verifiedAt:VERIFIED_AT}),
  Object.freeze({id:'social-premium',group:'social',name:'건강·연금 보험료 환급금',agency:'사회보험통합징수포털',url:'https://si4n.nhis.or.kr/',scope:'건강(장기요양)·연금 보험료 환급금',authRequired:true,apply:'official',priority:40,verifiedAt:VERIFIED_AT}),
  Object.freeze({id:'employment-industrial',group:'social',name:'고용·산재보험 반환금',agency:'근로복지공단',url:'https://total.comwel.or.kr/',scope:'고용·산재보험 반환금 조회·신청',authRequired:true,apply:'official',priority:50,verifiedAt:VERIFIED_AT}),
  Object.freeze({id:'telecom',group:'other',name:'통신 미환급액',agency:'스마트초이스',url:'https://www.smartchoice.or.kr/smc/service/refund.do',scope:'해지·번호이동 후 통신요금 미환급액',authRequired:true,apply:'official',priority:60,verifiedAt:VERIFIED_AT}),
  Object.freeze({id:'dormant-money',group:'other',name:'휴면예금·휴면보험금',agency:'서민금융진흥원',url:'https://www.kinfa.or.kr/financialLife/sleepmoney.do',scope:'휴면예금·휴면보험금 조회 및 지급신청',authRequired:true,apply:'official',priority:70,verifiedAt:VERIFIED_AT})
]);
export const PUBLIC_BENEFIT_SOURCE=Object.freeze({
  id:'government-benefits',group:'benefit',name:'혜택알리미',agency:'정부24',
  url:'https://plus.gov.kr/portal/benefitV2/',scope:'받을 수 있는 정부 혜택 발견',
  authRequired:true,apply:'official',verifiedAt:VERIFIED_AT
});

const SIGNAL_SOURCE_MAP=Object.freeze({
  tax:['national-tax','local-tax'],
  health:['health-refund','social-premium'],
  pension:['social-premium'],
  employment:['employment-industrial'],
  telecom:['telecom'],
  dormant:['dormant-money']
});

export function buildRefundSweep(input={}){
  const signals=new Set(Array.isArray(input.signals)?input.signals.map(String):[]);
  const fullSweep=input.fullSweep!==false;
  const ranked=PUBLIC_REFUND_SOURCES.map(source=>{
    let score=fullSweep?100-source.priority:0;
    for(const signal of signals)if((SIGNAL_SOURCE_MAP[signal]||[]).includes(source.id))score+=100;
    return {...source,score,reason:score>=100?'관련 이용 흔적 우선':'전수조회 기본 항목'};
  }).filter(item=>fullSweep||item.score>0).sort((a,b)=>b.score-a.score||a.priority-b.priority);
  return {generatedAt:new Date().toISOString(),mode:'official-handoff',fullSweep,signals:[...signals],sources:ranked,benefit:PUBLIC_BENEFIT_SOURCE,confirmedAmount:null};
}
