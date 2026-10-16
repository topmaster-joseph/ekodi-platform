// EKODI-owned USER4 Agent code cutover. This updates ONLY the signed Device Agent,
// never enables Hyper-V, reboots Windows, creates VMs or interacts with the user desktop.
const BASE='https://ekodi.kr/api/control/devices';
const COMMAND='agent.self_update';
export const USER4_EDITION_PROBE_CUTOVER=Date.parse('2026-10-12T11:35:25.000Z');
const when=x=>Date.parse(String(x||''));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function ensureUser4EditionProbeAgent({
  token,fetchImpl=fetch,clock=()=>Date.now(),sleepFn=sleep,
  maxPoll=55,pollMs=4000,minUpdateAt=USER4_EDITION_PROBE_CUTOVER
}={}){
  if(typeof token!=='string'||token.trim().length<20)throw Error('trusted_admin_session_required');
  if(!Number.isFinite(minUpdateAt)||minUpdateAt<=0)throw Error('invalid_release_cutover');
  async function req(path='',method='GET',body){
    const response=await fetchImpl(BASE+path,{method,redirect:'error',cache:'no-store',
      headers:{authorization:'Bearer '+token,accept:'application/json',
        ...(body?{'content-type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('user4_agent_update_http_'+response.status);
    return response.json().catch(()=>({}));
  }
  const all=async()=>{
    const data=await req();
    if(!Array.isArray(data.devices))throw Error('user4_agent_list_invalid');
    return data.devices;
  };
  const healthy=device=>{
    const seen=when(device?.lastSeenAt);
    return String(device?.hostname||'').trim().toLowerCase()==='user4' &&
      device.revokedAt==null && device.status==='online' &&
      device.management?.source==='agent' && device.management?.type==='pc' &&
      /win/i.test(String(device.platform||'')) &&
      Number.isFinite(seen) && seen<=clock() && clock()-seen<=90000;
  };
  const agent=(await all()).filter(healthy)
    .sort((a,b)=>when(b.lastSeenAt)-when(a.lastSeenAt))[0];
  if(!agent?.id||agent.capabilities?.agentStatus!==true)
    throw Error('user4_agent_not_healthy_for_update');
  const active=agent.recentCommands||[];
  const prior=active.find(c=>c.type===COMMAND && c.status==='succeeded' &&
    when(c.completedAt)>=minUpdateAt && when(agent.lastSeenAt)>=when(c.completedAt));
  if(prior)return {targetAlias:'user4',commandType:COMMAND,
    updatePerformed:false,receiptVerified:true};
  const running=active.filter(c=>['queued','claimed'].includes(c.status));
  const existing=running.find(c=>c.type===COMMAND && Number.isFinite(when(c.issuedAt)) &&
    clock()-when(c.issuedAt)>=0 && clock()-when(c.issuedAt)<120000);
  if(running.some(c=>c!==existing))throw Error('user4_agent_busy_no_interrupt');
  let command=existing;
  if(!command){
    const result=await req('/'+encodeURIComponent(agent.id)+'/commands','POST',
      {type:COMMAND,confirmed:true});
    command=result.command;
    if(command?.type!==COMMAND||typeof command.id!=='string'||!command.id||
      command.status!=='queued')throw Error('user4_agent_update_enqueue_invalid');
  }
  let completedAt=NaN;
  for(let n=0;n<maxPoll;n++){
    if(n>0)await sleepFn(pollMs);
    const current=(await all()).find(d=>d.id===agent.id);
    if(!current||current.revokedAt!=null)throw Error('user4_agent_registration_lost');
    const receipt=(current.recentCommands||[]).find(c=>c.id===command.id);
    if(receipt&&['failed','cancelled'].includes(receipt.status))
      throw Error('user4_agent_update_'+receipt.status);
    if(receipt?.status==='succeeded'){
      completedAt=when(receipt.completedAt);
      if(!Number.isFinite(completedAt)||completedAt<minUpdateAt)
        throw Error('user4_agent_update_receipt_outside_release');
    }
    if(Number.isFinite(completedAt)&&healthy(current)&&when(current.lastSeenAt)>=completedAt)
      return {targetAlias:'user4',commandType:COMMAND,
        updatePerformed:true,receiptVerified:true};
  }
  throw Error('user4_agent_update_reconnect_timeout');
}
