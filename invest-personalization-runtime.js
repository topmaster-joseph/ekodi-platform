import { resolveWorkspacePrincipal, auditPrincipal } from './ekodi-principal.js';
import { buildCanonicalProfile } from './profile-evidence-runtime.js';
import { officialDataConnections } from './profile-official-data-adapter.js';

const clean=(value,max=240)=>String(value??'').trim().slice(0,max);
const LENSES=Object.freeze({
  person:{label:'개인 투자 관점',summary:'개인의 목적·기간·유동성·위험감내 범위에서 같은 투자정보를 해석합니다.',sections:[['목적과 기간','투자 목적과 필요한 시점을 먼저 봅니다.'],['유동성과 생활자금','투자와 생활·비상자금을 섞지 않는지 확인합니다.'],['현재 노출과 집중','이미 보유한 자산·산업과 위험이 겹치는지 확인합니다.'],['이해 가능한 위험','손실 가능성과 불확실성을 개인이 이해할 수 있는 언어로 설명합니다.']],questions:[['personal.investmentGoal','이 자금의 목적은 무엇인가요?'],['personal.timeHorizon','언제까지 사용할 계획이 없는 자금인가요?'],['personal.liquidityNeed','중간에 현금이 필요할 가능성이 있나요?'],['personal.riskTolerance','어느 정도의 가격 변동과 손실 가능성을 감당할 수 있나요?'],['portfolio.currentExposure','이미 비슷한 자산·산업에 얼마나 노출되어 있나요?']]},
  business:{label:'사업체 투자 관점',summary:'사업 운영자금과 투자자금을 분리하고 현금흐름·운전자금·전략적 적합성을 우선합니다.',sections:[['운영 안정성','급여·임차료·매입 등 운영자금을 침범하지 않는지 봅니다.'],['현금흐름과 런웨이','투자 후에도 사업의 필요한 유동성이 남는지 확인합니다.'],['전략적 연관성','본업·고객·공급망·기술과 연결되는 투자 가치가 있는지 봅니다.'],['회수와 의사결정','필요할 때 회수 가능한지와 내부 승인 절차를 확인합니다.']],questions:[['finance.cashReserve','투자와 별도로 유지해야 할 최소 현금성 자산은 얼마인가요?'],['finance.operatingRunway','현재 현금으로 몇 개월 운영할 수 있나요?'],['finance.workingCapitalNeed','향후 운전자금 수요가 예정되어 있나요?'],['finance.debtObligations','상환 예정 차입금이나 확정 의무가 있나요?'],['strategy.investmentPurpose','이 투자가 본업과 어떤 전략적 관계가 있나요?']]},
  organization:{label:'기관·단체 투자 관점',summary:'기관의 설립목적·기금 성격·투자정책·승인구조·책임성을 중심으로 정보를 재구성합니다.',sections:[['자금의 목적','일반재원·목적기금·제한기금 등 사용할 수 있는 자금인지 먼저 봅니다.'],['정책과 권한','정관·내부 투자정책·이사회 또는 위원회 승인 범위를 확인합니다.'],['안정성과 유동성','기관 운영과 약속된 지출을 해치지 않는 범위인지 봅니다.'],['집중·책임 위험','한 자산에 과도하게 집중되거나 기관의 가치·책임과 충돌하지 않는지 확인합니다.']],questions:[['governance.fundPurpose','이 자금의 법적·회계상 목적은 무엇인가요?'],['governance.restrictedFunds','사용이 제한된 기금이 포함되어 있나요?'],['finance.liquidityReserve','운영을 위해 반드시 남겨야 하는 유동성은 얼마인가요?'],['governance.investmentPolicy','정관·투자정책·내부 한도가 있나요?'],['governance.approvalAuthority','누가 어떤 절차로 투자 결정을 승인해야 하나요?']]},
  project:{label:'프로젝트 투자 관점',summary:'프로젝트가 필요한 자금의 목적·기간·마일스톤·실행위험과 성과근거를 중심으로 봅니다.',sections:[['자금 사용처','무엇에 얼마가 필요한지와 다른 재원 가능성을 확인합니다.'],['기간과 마일스톤','언제 무엇을 달성해야 하는지 검증합니다.'],['수익·회수 구조','현금흐름과 회수 가능성의 근거를 분리해서 봅니다.'],['실행·성과 위험','팀·인허가·공급망·시장·사회적 성과의 핵심 위험을 확인합니다.']],questions:[['project.capitalPurpose','필요한 자금은 정확히 어디에 사용되나요?'],['project.duration','프로젝트의 예상 기간은 얼마인가요?'],['project.milestones','중간 성공 여부를 판단할 마일스톤은 무엇인가요?'],['project.revenueModel','수익 또는 회수 구조의 근거는 무엇인가요?'],['project.executionDependencies','성공에 반드시 필요한 외부 조건은 무엇인가요?']]},
});

function cors(request,env){const origin=String(request.headers.get('origin')||'');const allowed=String(env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);const ok=!origin||allowed.includes(origin);const headers={'access-control-allow-headers':'content-type, authorization','access-control-allow-methods':'GET, OPTIONS','access-control-max-age':'86400',vary:'Origin'};if(origin&&ok)headers['access-control-allow-origin']=origin;return {ok,headers}}
function json(request,env,data,status=200){const {headers}=cors(request,env);return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}})}
function lensKey(entityType,subjectType){if(entityType&&LENSES[entityType])return entityType;return subjectType==='tenant'?'organization':'person'}

async function latestProfile(env,subject,requested=''){
  if(requested){return env.DB.prepare(`SELECT profile_key,entity_type,display_name,review_state,updated_at FROM ekodi_profiles WHERE profile_key=? AND subject_type=? AND subject_key=? AND status='active'`).bind(clean(requested,120),subject.type,subject.key).first()}
  return env.DB.prepare(`SELECT profile_key,entity_type,display_name,review_state,updated_at FROM ekodi_profiles WHERE subject_type=? AND subject_key=? AND status='active' ORDER BY updated_at DESC LIMIT 1`).bind(subject.type,subject.key).first();
}
async function canonicalFor(env,profileKey){
  if(!profileKey)return buildCanonicalProfile([]);
  const rows=await env.DB.prepare(`SELECT id,evidence_key,field_path,value_json,source_class,source_name,source_url,source_record_id,observed_at,confidence,review_state,is_current FROM ekodi_profile_evidence WHERE profile_key=? AND is_current=1 ORDER BY field_path,id DESC`).bind(profileKey).all();
  return buildCanonicalProfile(rows.results||[]);
}
function questionStatus(question,fields){
  const found=fields.find(item=>item.fieldPath===question[0]);
  return {fieldPath:question[0],question:question[1],status:found?(found.humanConfirmed?'confirmed':'known_needs_confirmation'):'missing',sourceClass:found?.sourceClass||'needs_check',value:found?.value??null};
}
export function buildInvestLens(entityType='person',subjectType='person',fields=[]){
  const key=lensKey(entityType,subjectType),lens=LENSES[key];
  return {key,label:lens.label,summary:lens.summary,sections:lens.sections.map(([title,body])=>({title,body})),questions:lens.questions.map(question=>questionStatus(question,fields))};
}

export async function handleInvestPersonalizationApi(request,env){
  const url=new URL(request.url);const path=url.pathname.replace(/\/+$/,'')||'/';
  if(path!=='/v1/invest/context'&&path!=='/v1/invest/data-connections')return null;
  const {ok,headers}=cors(request,env);if(request.method==='OPTIONS')return new Response(null,{status:ok?204:403,headers});if(!ok)return json(request,env,{error:'ORIGIN_FORBIDDEN'},403);if(request.method!=='GET')return json(request,env,{error:'METHOD_NOT_ALLOWED'},405);
  if(!env?.DB)return json(request,env,{error:'DATABASE_UNAVAILABLE'},503);
  const ctx=await resolveWorkspacePrincipal(request,env,{write:false});if(ctx.error)return json(request,env,{error:ctx.error},ctx.status);
  const connections=officialDataConnections(env);
  if(path==='/v1/invest/data-connections'){
    await auditPrincipal(env,ctx.principal,'invest:data-connections');
    return json(request,env,{subject:ctx.subject,connections,policy:{secretsExposed:false,officialDataFirst:true,myDataRequiresExplicitConsent:true,transactionExecution:false}});
  }
  const profile=await latestProfile(env,ctx.subject,url.searchParams.get('profile_key')||'');
  const canonical=await canonicalFor(env,profile?.profile_key||'');
  const lens=buildInvestLens(profile?.entity_type||'',ctx.subject.type,canonical.fields);
  const unresolved=lens.questions.filter(item=>item.status!=='confirmed');
  await auditPrincipal(env,ctx.principal,'invest:context');
  return json(request,env,{
    subject:ctx.subject,
    profile:profile?{profileKey:profile.profile_key,entityType:profile.entity_type,displayName:profile.display_name,reviewState:profile.review_state,updatedAt:profile.updated_at}:null,
    lens,
    evidence:{readiness:canonical.readiness,sourceCounts:canonical.sourceCounts},
    nextQuestions:unresolved,
    connections,
    policy:{informationAndAnalysisOnly:true,personalizedPerspective:true,investmentAdvice:false,buySellInstruction:false,portfolioAllocation:false,transactionExecution:false,custody:false,guaranteedReturn:false,aiInferenceNeverOverridesEvidence:true},
  });
}
