const TERMINAL=new Set(['completed','blocked','failed','cancelled']);

export const COMPLETION_CONTRACTS=Object.freeze({
  engineering_deployment:Object.freeze(['authorized_task','verified_artifact','required_gates','merged_change','staging_verified','production_verified','live_verified']),
  data_mutation:Object.freeze(['authorized_task','write_receipt','read_back_verified']),
  external_provider_action:Object.freeze(['authorized_task','provider_receipt','ekodi_read_back_verified']),
  non_mutating_analysis:Object.freeze(['authorized_task','result_evidence']),
});

function list(value){return Array.isArray(value)?value:[]}
function kind(item){return String(item?.kind||item?.type||'').trim().toLowerCase()}

export function projectExecutionState({events=[],evidence=[],completionContract='engineering_deployment',now=Date.now()}={}){
  const ev=list(events),proof=list(evidence),all=[...ev,...proof];
  const kinds=new Set(all.map(kind).filter(Boolean));
  const required=COMPLETION_CONTRACTS[completionContract]||COMPLETION_CONTRACTS.engineering_deployment;
  const terminalEvent=[...ev].reverse().find(item=>TERMINAL.has(String(item?.toState||item?.state||'').toLowerCase()));
  if(terminalEvent&&String(terminalEvent.toState||terminalEvent.state).toLowerCase()!=='completed')
    return Object.freeze({state:String(terminalEvent.toState||terminalEvent.state).toLowerCase(),reason:'terminal_event',contract:completionContract});
  if(required.every(item=>kinds.has(item)))
    return Object.freeze({state:'completed',reason:'completion_contract_satisfied',contract:completionContract});
  if(kinds.has('evidence_conflict')||kinds.has('contradictory_evidence'))
    return Object.freeze({state:'needs_reconciliation',reason:'evidence_conflict',contract:completionContract});
  const lease=[...ev].reverse().find(item=>kind(item)==='execution_claimed');
  if(lease){
    const expires=Date.parse(String(lease.leaseExpiresAt||lease.lease_expires_at||''));
    if(Number.isFinite(expires)&&expires<=Number(now))return Object.freeze({state:'recoverable',reason:'execution_lease_expired',contract:completionContract});
    return Object.freeze({state:'running',reason:'active_execution_claim',contract:completionContract});
  }
  if(kinds.has('authorized_task')||kinds.has('task_created'))return Object.freeze({state:'queued',reason:'awaiting_execution',contract:completionContract});
  return Object.freeze({state:'unknown',reason:'insufficient_events',contract:completionContract});
}

export function completionGap(input={}){
  const contract=input.completionContract||'engineering_deployment';
  const required=COMPLETION_CONTRACTS[contract]||COMPLETION_CONTRACTS.engineering_deployment;
  const kinds=new Set([...list(input.events),...list(input.evidence)].map(kind).filter(Boolean));
  return Object.freeze(required.filter(item=>!kinds.has(item)));
}
