// Growth OS common intelligence contract (not a marketing service).
// A pure, side-effect free evidence interpreter. Data is supplied only by
// independently authorized source adapters; this module grants no access.
export const GROWTH_CORE_VERSION = '1.0.0';
export const GROWTH_DIMENSIONS = Object.freeze([
  {id:'purpose',label:'목적·가치 실현',source:'mission_and_strategy'},
  {id:'people',label:'사람·관계',source:'consented_aggregate_participation'},
  {id:'operations',label:'운영·서비스',source:'authorized_operations'},
  {id:'resources',label:'재정·자원 지속가능성',source:'authorized_aggregate_finance'},
  {id:'discovery',label:'접근·확산',source:'verified_public_discovery'},
  {id:'trust',label:'신뢰·안전',source:'governance_and_risk'},
  {id:'learning',label:'학습·변화',source:'verified_change_evidence'},
]);
export const GROWTH_PROFILES = Object.freeze({
  ministry: Object.freeze({label:'교회·선교·돌봄',purpose:'돌봄·예배·선교 및 공동체의 건강한 지속',focus:Object.freeze(['purpose','people','trust'])}),
  cooperative:Object.freeze({label:'협동조합·단체·상인회',purpose:'공동체의 참여·상호이익·지역 지속가능성',focus:Object.freeze(['people','resources','trust'])}),
  commerce:Object.freeze({label:'매장·사업·상거래',purpose:'고객 가치·건전한 수익·지속가능한 사업',focus:Object.freeze(['operations','resources','people'])}),
  education:Object.freeze({label:'교육·연구·출판',purpose:'학습 성취·지식의 신뢰와 접근성',focus:Object.freeze(['purpose','learning','trust'])}),
  institution:Object.freeze({label:'기관·공익서비스',purpose:'공익 목적·책무성·서비스 접근성',focus:Object.freeze(['purpose','people','trust'])}),
  platform:Object.freeze({label:'디지털 플랫폼·공통서비스',purpose:'안전하고 지속가능한 연결·운영',focus:Object.freeze(['operations','trust','learning'])}),
  general:Object.freeze({label:'목적 프로필 미설정',purpose:'기관 목적을 확인한 뒤 평가 기준을 설정',focus:Object.freeze([])}),
});
const known = new Set(GROWTH_DIMENSIONS.map(row=>row.id));
const allowedStates = new Set(['observed','issue','not_connected','withheld']);
function sanitize(value,max=160){return String(value??'').trim().slice(0,max);}
function evidenceState(item,workspaceId){
  if(!item || !allowedStates.has(item.status))return null;
  if(item.status==='not_connected'||item.status==='withheld')return {
    status:item.status, source:null, observedAt:null, value:null, authorized:false
  };
  // A reported observation must identify the same immutable workspace and a
  // delegated evidence adapter. A public slug alone grants no data access.
  if(item.workspaceId!==workspaceId || item.authorization!=='authorized_scoped_aggregate')return null;
  // A reported number must have a verified source and observation time;
  // never substitute missing evidence with zero.
  const source=sanitize(item.source,120);
  const observedAt=sanitize(item.observedAt,40);
  if(!source || !/^\d{4}-\d\d-\d\dT/.test(observedAt) || !Number.isFinite(Date.parse(observedAt)))return null;
  const numeric=typeof item.value==='number' && Number.isFinite(item.value)?item.value:null;
  return {status:item.status,source,observedAt,value:numeric,authorized:true};
}
// Use immutable workspace identity where available; public slugs are never authority.
export function evaluateGrowthOrganization({workspaceId, profile='general', evidence={}, asOf=''}={}){
  const id=sanitize(workspaceId,128);
  if(!id)throw new TypeError('workspaceId is required from an authorized context');
  const chosen=Object.hasOwn(GROWTH_PROFILES,profile)?profile:'general';
  const safeEvidence=evidence&&typeof evidence==='object'&&!Array.isArray(evidence)?evidence:{};
  const dimensions=GROWTH_DIMENSIONS.map(def=>{
    const raw=Object.hasOwn(safeEvidence,def.id)?safeEvidence[def.id]:null;
    const normalized=evidenceState(raw,id);
    return Object.freeze({
      id:def.id,label:def.label,expectedSource:def.source,
      ...normalized || {status:'not_connected',source:null,observedAt:null,value:null,authorized:false},
      priority:GROWTH_PROFILES[chosen].focus.includes(def.id)?'purpose_priority':'standard',
    });
  });
  const verified=dimensions.filter(d=>d.authorized).length;
  const withheld=dimensions.filter(d=>d.status==='withheld').length;
  const issues=dimensions.filter(d=>d.status==='issue');
  return Object.freeze({
    version:GROWTH_CORE_VERSION,
    workspaceId:id,
    profile:{id:chosen,...GROWTH_PROFILES[chosen]},
    dimensions,coverage:{observed:verified,total:dimensions.length,withheld,unknown:dimensions.length-verified-withheld},
    issues:issues.map(item=>({dimension:item.id,source:item.source,observedAt:item.observedAt})),
    nextActions: [
      ...(chosen==='general'?[{id:'set_purpose',mode:'human_review',description:'목적·평가기준을 조직 관리자와 확인'}]:[]),
      ...dimensions.filter(row=>row.status==='not_connected').map(row=>({
        id:'connect_'+row.id,mode:'consented_read_only_adapter',description:row.label+'의 승인된 증거 연동'
      })),
      ...issues.map(row=>({id:'review_'+row.id,mode:'orchestrator_review',description:row.label+' 관련 사실·원인 확인'})),
    ],
    governance:{
      runtime:'pure_read_only',autonomousChanges:false,spend:false,posting:false,
      decisionsRequire:'EKODI Orchestrator policy + local site membership + risk-based human gate',
      crossTenantJoin:false,personalDataIncluded:false,
    },
    limitations:'No composite growth score, ranking, benchmark, financial inference or AI decision without explicitly authorized evidence.',
    asOf:sanitize(asOf,40)||null,
  });
}
export function validateGrowthEvidenceContract(input,workspaceId){
  if(!workspaceId||!input||typeof input!=='object'||Array.isArray(input))return false;
  return Object.entries(input).every(([key,value])=>known.has(key) && evidenceState(value,String(workspaceId))!==null);
}
