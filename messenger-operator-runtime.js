import { drainMessengerOutbox } from './messenger-outbox.js';
import { channelConfigurationStatus } from './messenger-channel-adapters.js';

const clean=(value,max=1000)=>String(value??'').trim().slice(0,max);

export async function messengerOperationsReport(env){
  if(!env?.DB)return {ok:false,error:'DATABASE_UNAVAILABLE'};
  const [threads,outbox,handoffs,actions]=await Promise.all([
    env.DB.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status='waiting_human' THEN 1 ELSE 0 END) AS waiting_human,
      SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open_threads
      FROM messenger_threads`).first(),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN status IN ('pending','processing','failed') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status='dead' THEN 1 ELSE 0 END) AS dead,
      SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
      FROM messenger_outbox`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS active FROM messenger_handoffs WHERE status IN ('requested','accepted')`).first(),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN status='awaiting_human' THEN 1 ELSE 0 END) AS awaiting_human,
      SUM(CASE WHEN status='approved_pending_executor' THEN 1 ELSE 0 END) AS approved_pending_executor
      FROM ai_agent_actions`).first().catch(()=>({awaiting_human:0,approved_pending_executor:0})),
  ]);
  return {
    ok:true,
    generatedAt:new Date().toISOString(),
    conversations:{total:Number(threads?.total||0),open:Number(threads?.open_threads||0),waitingHuman:Number(threads?.waiting_human||0),activeHandoffs:Number(handoffs?.active||0)},
    outbox:{pending:Number(outbox?.pending||0),failed:Number(outbox?.failed||0),dead:Number(outbox?.dead||0)},
    approvals:{awaitingHuman:Number(actions?.awaiting_human||0),approvedPendingExecutor:Number(actions?.approved_pending_executor||0)},
    channels:channelConfigurationStatus(env),
  };
}

export async function executeMessengerSafeAction(env,action){
  if(action?.actionType==='messenger.operations_report'){
    if(action.area!=='read_only_audits')return {ok:false,code:'EXECUTOR_AREA_MISMATCH'};
    return messengerOperationsReport(env);
  }
  if(action?.actionType==='messenger.outbox_drain'){
    if(action.area!=='incident_triage')return {ok:false,code:'EXECUTOR_AREA_MISMATCH'};
    const limit=Math.max(1,Math.min(Number(action.payload?.limit)||20,30));
    return {ok:true,drain:await drainMessengerOutbox(env,{limit}),report:await messengerOperationsReport(env)};
  }
  return null;
}

export function classifyOperatorCommand(input=''){
  const raw=clean(input,4000);
  const text=raw.toLowerCase();
  const base={agentId:'chief',target:'ekodi',rationale:raw,payload:{command:raw},logged:true};
  if(!raw)return null;

  if(/(outbox|아웃박스|재시도|복구|밀린.*처리|처리.*밀림)/i.test(raw)){
    return {...base,agentId:'platform',actionType:'messenger.outbox_drain',area:'incident_triage',reversible:true,delegated:true,preflightVerified:true,payload:{command:raw,limit:20}};
  }
  if(/(메신저|대화|문의|승인|채널).*(현황|상태|보고|요약)|^(현황|상태|보고|요약)/i.test(raw)){
    return {...base,actionType:'messenger.operations_report',area:'read_only_audits',reversible:false,delegated:true,preflightVerified:true};
  }
  if(/(서비스|시스템|전체).*(상태|헬스|health|점검)/i.test(raw)){
    return {...base,agentId:'platform',actionType:'service.health_check',area:'health_checks',reversible:false,delegated:true,preflightVerified:true};
  }
  if(/(삭제|초기화|폐기|대량).*(회원|사용자|데이터|db|데이터베이스)|((회원|사용자|데이터|db|데이터베이스).*(삭제|초기화|폐기|대량))/i.test(raw)){
    return {...base,agentId:'security',actionType:'operator.request',area:'destructive_or_mass_data_change',reversible:false,delegated:false,preflightVerified:false,reducesUserRights:true};
  }
  if(/(권한|계정|identity).*(변경|병합|이전|삭제)|((변경|병합|이전|삭제).*(권한|계정|identity))/i.test(raw)){
    return {...base,agentId:'security',actionType:'operator.request',area:'identity_merge_or_irreversible_privacy_change',reversible:false,delegated:false,preflightVerified:false,reducesUserRights:true};
  }
  if(/(결제|송금|환불|계약|서명|보험가입|보험 가입)/i.test(raw)){
    const legal=/(계약|서명)/i.test(raw);
    return {...base,agentId:legal?'commerce':'finance',actionType:'operator.request',area:legal?'legal_commitment_or_contract_execution':'high_value_or_exceptional_financial_commitment',reversible:false,delegated:false,preflightVerified:false};
  }
  if(/(배포|deploy|운영.*수정|프로덕션|production)/i.test(raw)){
    return {...base,agentId:'release',actionType:'operator.release_request',area:'bounded_release_change',reversible:true,delegated:false,preflightVerified:false};
  }
  return {...base,actionType:'operator.analysis',area:'analytics',reversible:false,delegated:false,preflightVerified:false};
}
