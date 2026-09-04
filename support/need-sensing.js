export const NEED_SIGNAL_SOURCES=Object.freeze({
  USER_EXPLICIT:'user-explicit',
  VERIFIED_PROFILE:'verified-profile',
  LIFE_EVENT:'life-event',
  WORKSPACE_CONTEXT:'workspace-context',
  ACTIVITY_CONTEXT:'activity-context',
  EXTERNAL_VERIFIED:'external-verified'
});

const SOURCE_WEIGHT=Object.freeze({
  [NEED_SIGNAL_SOURCES.USER_EXPLICIT]:1,
  [NEED_SIGNAL_SOURCES.VERIFIED_PROFILE]:0.9,
  [NEED_SIGNAL_SOURCES.LIFE_EVENT]:0.75,
  [NEED_SIGNAL_SOURCES.WORKSPACE_CONTEXT]:0.5,
  [NEED_SIGNAL_SOURCES.ACTIVITY_CONTEXT]:0.2,
  [NEED_SIGNAL_SOURCES.EXTERNAL_VERIFIED]:0.9
});

const SENSITIVE_KEYS=new Set([
  'health','medical','disability','religion','politics','political','sexuality','sexual_orientation',
  'biometric','criminal','genetic','mental_health'
]);

const NEED_CATEGORY_RULES=Object.freeze([
  {id:'grant',label:'사업·성장',keywords:['사업자','소상공인','창업','매출','직원','채용','마케팅','디지털','ai','로봇','설비','시설','경영','사업화','수출','특허']},
  {id:'subsidy',label:'비용·생활 보조',keywords:['보조금','비용','환급','감면','바우처','전기','에너지','냉난방','주거','임대','이사','교통','통신']},
  {id:'scholarship',label:'학업·연구',keywords:['학생','대학','대학원','장학','학자금','등록금','연구','논문','교육','훈련']},
  {id:'contest',label:'공모·프로젝트',keywords:['공모','프로젝트','기관','단체','비영리','지역사회','사업계획','수행기관']},
  {id:'welfare',label:'복지·생활',keywords:['복지','생계','생활비','돌봄','육아','보육','출산','가족','청년','시니어','노인','주거지원','의료지원']},
  {id:'private',label:'민간지원',keywords:['재단','민간지원','사회공헌','csr','기업지원','공익']},
  {id:'sponsorship',label:'후원·자원',keywords:['후원','기부','후원자','자원연결','사회공헌']}
]);

const normalizeText=value=>String(value??'').replace(/\s+/g,' ').trim().toLowerCase();
const asList=value=>Array.isArray(value)?value.filter(Boolean):value?[value]:[];
const sensitiveSignal=signal=>SENSITIVE_KEYS.has(String(signal?.key||signal?.category||'').toLowerCase())||signal?.sensitive===true;

function signalAllowed(signal,consent){
  if(!signal||signal.consent===false)return{allowed:false,reason:'signal_not_consented'};
  const source=signal.source||NEED_SIGNAL_SOURCES.USER_EXPLICIT;
  if(source===NEED_SIGNAL_SOURCES.ACTIVITY_CONTEXT&&!consent.activityContext)return{allowed:false,reason:'activity_context_not_enabled'};
  if(source===NEED_SIGNAL_SOURCES.EXTERNAL_VERIFIED&&!consent.externalData)return{allowed:false,reason:'external_data_not_enabled'};
  if(sensitiveSignal(signal)&&!consent.sensitiveBenefits)return{allowed:false,reason:'sensitive_signal_requires_explicit_consent'};
  return{allowed:true,reason:'allowed'};
}

function categoryScores(text){
  return NEED_CATEGORY_RULES.map(rule=>{
    const hits=rule.keywords.filter(keyword=>text.includes(keyword));
    return{id:rule.id,label:rule.label,score:Math.min(100,hits.length*24),hits};
  }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score);
}

function defaultCategoryFromProfile(profile={}){
  const type=normalizeText(profile.profileType);
  if(['사업자','소상공인','기업'].some(v=>type.includes(v)))return{id:'grant',label:'사업·성장',score:28,hits:['대상 유형']};
  if(['학생','연구자'].some(v=>type.includes(v)))return{id:'scholarship',label:'학업·연구',score:28,hits:['대상 유형']};
  if(['기관','단체','교회','비영리'].some(v=>type.includes(v)))return{id:'contest',label:'공모·프로젝트',score:24,hits:['대상 유형']};
  return null;
}

export function assessNeedState(profile={},context={}){
  const consent={
    proactiveBenefits:Boolean(context?.consent?.proactiveBenefits),
    activityContext:Boolean(context?.consent?.activityContext),
    externalData:Boolean(context?.consent?.externalData),
    sensitiveBenefits:Boolean(context?.consent?.sensitiveBenefits)
  };
  const rawSignals=Array.isArray(context.signals)?context.signals:[];
  const acceptedSignals=[];
  const ignoredSignals=[];
  for(const signal of rawSignals){
    const gate=signalAllowed(signal,consent);
    if(gate.allowed)acceptedSignals.push({...signal,source:signal.source||NEED_SIGNAL_SOURCES.USER_EXPLICIT,weight:SOURCE_WEIGHT[signal.source||NEED_SIGNAL_SOURCES.USER_EXPLICIT]??0.3});
    else ignoredSignals.push({source:signal?.source||'unknown',key:signal?.key||null,reason:gate.reason});
  }

  const explicitNeed=normalizeText(profile.need);
  const interests=asList(profile.interests).map(normalizeText).filter(Boolean);
  const profileContext=[profile.profileType,profile.industry,profile.businessType,profile.summary].map(normalizeText).filter(Boolean);
  const signalText=acceptedSignals.map(signal=>normalizeText([signal.label,signal.value,signal.category].filter(Boolean).join(' '))).filter(Boolean);
  const combinedText=[explicitNeed,...interests,...profileContext,...signalText].filter(Boolean).join(' ');
  const categories=categoryScores(combinedText);
  if(!categories.length){const fallback=defaultCategoryFromProfile(profile);if(fallback)categories.push(fallback)}

  const strongSignals=acceptedSignals.filter(signal=>signal.weight>=0.7);
  const contextualSignals=acceptedSignals.filter(signal=>signal.weight<0.7);
  const evidenceScore=(explicitNeed?48:0)+Math.min(interests.length*6,12)+Math.min(strongSignals.reduce((sum,signal)=>sum+signal.weight*18,0),27)+Math.min(contextualSignals.reduce((sum,signal)=>sum+signal.weight*8,0),8);
  const needScore=Math.round(Math.min(100,evidenceScore+(categories[0]?.score||0)*0.22));
  const confidence=Math.min(1,0.18+(explicitNeed?0.42:0)+(profile.profileType?0.1:0)+(profile.region?0.1:0)+Math.min(strongSignals.length*0.12,0.24)+Math.min(contextualSignals.length*0.03,0.06));

  const reasons=[];
  if(explicitNeed)reasons.push('사용자가 지원이 필요한 상황을 직접 입력했습니다.');
  if(profile.region)reasons.push(`사용자가 제공한 지역 조건(${String(profile.region).trim()})을 사용할 수 있습니다.`);
  if(profile.profileType)reasons.push(`사용자가 선택한 대상 유형(${String(profile.profileType).trim()})을 사용할 수 있습니다.`);
  if(strongSignals.length)reasons.push(`동의된 확인 신호 ${strongSignals.length}건이 있습니다.`);
  if(contextualSignals.length)reasons.push(`동의된 보조 맥락 신호 ${contextualSignals.length}건은 낮은 가중치로만 사용합니다.`);

  const questions=[];
  if(!profile.region)questions.push({key:'region',question:'주로 거주하거나 사업을 운영하는 지역은 어디인가요?',reason:'지역 제한 지원을 거르기 위해 필요합니다.'});
  if(!profile.profileType)questions.push({key:'profileType',question:'개인, 학생, 사업자, 기관·단체 중 어디에 가장 가깝나요?',reason:'지원 대상 범위를 좁히기 위해 필요합니다.'});
  if(!explicitNeed&&!strongSignals.length)questions.push({key:'need',question:'요즘 비용, 일자리, 사업, 주거, 돌봄, 학업 중 가장 도움이 필요한 영역은 무엇인가요?',reason:'필요를 추측하지 않고 사용자에게 확인하기 위해 필요합니다.'});
  if(normalizeText(profile.profileType).includes('사업자')&&!profile.businessType)questions.push({key:'businessType',question:'사업자라면 업종 또는 사업 형태를 간단히 알려주세요.',reason:'사업자 지원의 자격조건을 더 정확히 확인하기 위해 필요합니다.'});

  const hasMeaningfulEvidence=Boolean(explicitNeed||strongSignals.length||interests.length);
  const proactiveEligible=Boolean(consent.proactiveBenefits&&hasMeaningfulEvidence&&confidence>=0.55);

  return{
    needScore,
    confidence:Number(confidence.toFixed(2)),
    confidenceLabel:confidence>=0.8?'높음':confidence>=0.55?'보통':'추가 확인 필요',
    categories:categories.slice(0,3),
    reasons,
    questions:questions.slice(0,2),
    proactiveEligible,
    consent,
    acceptedSignalCount:acceptedSignals.length,
    ignoredSignals,
    policy:{activityContextDefault:false,sensitiveInferenceDefault:false,externalDataDefault:false,decision:'recommendation-support-only'}
  };
}

export function opportunityNeedAlignment(assessment={},serviceId='grant'){
  const match=(assessment.categories||[]).find(item=>item.id===serviceId);
  if(!match)return assessment.needScore?Math.max(20,Math.round(assessment.needScore*0.35)):30;
  return Math.min(100,Math.round(match.score*0.65+assessment.needScore*0.35));
}
