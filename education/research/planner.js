export const RESEARCH_STAGES=Object.freeze([
 {id:'idea',label:'연구주제 선정'},
 {id:'literature',label:'선행연구 조사'},
 {id:'design',label:'연구설계'},
 {id:'analysis',label:'자료수집·분석'},
 {id:'writing',label:'논문 작성·수정'},
 {id:'submission',label:'심사·투고 준비'},
]);
const clean=(value,max)=>String(value??'').trim().slice(0,max);
export function cleanResearchInput(raw={}){
 return {
  degree:['master','doctor','researcher','other'].includes(raw.degree)?raw.degree:'master',
  stage:RESEARCH_STAGES.some(row=>row.id===raw.stage)?raw.stage:'idea',
  field:clean(raw.field,80),
  theme:clean(raw.theme,140),
  hurdle:['topic','literature','method','statistics','writing','submission'].includes(raw.hurdle)?raw.hurdle:'topic',
  method:['undecided','quantitative','qualitative','mixed'].includes(raw.method)?raw.method:'undecided'
 };
}
export function assessResearch(input){
 const data=cleanResearchInput(input);
 const map={
  topic:['연구 대상과 핵심 현상을 한 문장으로 정의합니다.','연구 목적과 연구 질문의 일관성을 확인합니다.'],
  literature:['핵심 개념별 검색어와 문헌 포함 기준을 정합니다.','DOI·서지정보를 원문 출처와 대조합니다.'],
  method:['연구 질문에 적합한 방법론과 측정 방법을 정합니다.','표본·윤리·자료 수집 가능성을 확인합니다.'],
  statistics:['자료 유형과 연구 질문에 맞는 분석 계획을 점검합니다.','통계 해석은 실제 데이터 및 전문가 검토에 근거해야 합니다.'],
  writing:['각 장의 주장·근거·전환을 점검합니다.','인용과 참고문헌의 정확성을 교차 확인합니다.'],
  submission:['학술지·학교의 최신 원고 지침을 확인합니다.','심사 의견별 수정 대응표를 작성합니다.']
 };
 const stageIndex=RESEARCH_STAGES.findIndex(row=>row.id===data.stage);
 const tasks=[...map[data.hurdle]];
 if(!data.theme)tasks.unshift('연구주제를 구체적인 문장으로 입력합니다.');
 if(data.method==='undecided'&&stageIndex>=2)tasks.push('양적·질적·혼합연구 중 적합한 연구방법을 검토합니다.');
 tasks.push('연구자가 최종 판단하며 원자료·인용을 직접 검증합니다.');
 return {kind:'rule_based_research_guidance',stage:RESEARCH_STAGES[stageIndex].label,progress:Math.round(stageIndex/5*100),tasks,recommendation:data.hurdle==='statistics'?'연구방법론·통계 컨설팅':'연구계획 및 원고 진단',verifiedLiterature:false,aiGenerated:false,notice:'자동 안내이며 논문 심사·학위 취득·게재를 보장하지 않습니다.'};
}
