export const PERSONALIZATION_VERSION=1;
export const PERSONALIZATION_STATES=Object.freeze({AVAILABLE:'available',ACTIVE:'active',PINNED:'pinned'});
const VALID_STATES=new Set(Object.values(PERSONALIZATION_STATES));
const VALID_SOURCES=new Set(['system','admin','ai']);
const ACTIVE_FADE_DAYS=45;
const RECOMMENDATION_THRESHOLD=2;
const MS_DAY=86400000;

const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number(value)||0));
const time=value=>{const parsed=Date.parse(value||'');return Number.isFinite(parsed)?parsed:0};
const iso=value=>new Date(value).toISOString();

export function normalizePreference(row={}){
  return {
    service_id:String(row.service_id||''),
    state:VALID_STATES.has(row.state)?row.state:PERSONALIZATION_STATES.AVAILABLE,
    interest_score:clamp(row.interest_score,0,10),
    last_engaged_at:row.last_engaged_at||null,
    dismissed_until:row.dismissed_until||null,
    activated_at:row.activated_at||null,
    updated_at:row.updated_at||null,
  };
}

export function normalizeSignal(row={}){
  const source=String(row.source||'');
  if(!VALID_SOURCES.has(source))return null;
  return {
    service_id:String(row.service_id||''),source,
    signal_type:String(row.signal_type||'context'),
    weight:clamp(row.weight,-5,5),
    created_at:row.created_at||null,
    expires_at:row.expires_at||null,
  };
}
function signalScore(signal,nowMs){
  const created=time(signal.created_at)||nowMs;
  const expires=time(signal.expires_at);
  if(expires&&expires<=nowMs)return 0;
  const ageDays=Math.max(0,(nowMs-created)/MS_DAY);
  const decay=ageDays<=7?1:ageDays<=30?.65:ageDays<=90?.3:.1;
  const sourceFactor=signal.source==='admin'?1.15:signal.source==='system'?1:0.9;
  return signal.weight*decay*sourceFactor;
}

function effectiveState(preference,{connected,nowMs}){
  if(preference.state===PERSONALIZATION_STATES.PINNED)return PERSONALIZATION_STATES.PINNED;
  if(time(preference.dismissed_until)>nowMs)return PERSONALIZATION_STATES.AVAILABLE;
  if(preference.state===PERSONALIZATION_STATES.ACTIVE){
    const engaged=time(preference.last_engaged_at||preference.activated_at||preference.updated_at);
    if(engaged&&nowMs-engaged>ACTIVE_FADE_DAYS*MS_DAY)return PERSONALIZATION_STATES.AVAILABLE;
    return PERSONALIZATION_STATES.ACTIVE;
  }
  return connected?PERSONALIZATION_STATES.ACTIVE:PERSONALIZATION_STATES.AVAILABLE;
}

export function applyPreferenceAction(row={},action,now=new Date()){
  const current=normalizePreference(row),stamp=iso(now);
  if(action==='interest')return {...current,interest_score:clamp(current.interest_score+2,0,10),last_engaged_at:stamp,dismissed_until:null,updated_at:stamp};
  if(action==='engage')return {...current,interest_score:clamp(current.interest_score+1,0,10),last_engaged_at:stamp,dismissed_until:null,updated_at:stamp};
  if(action==='activate')return {...current,state:'active',interest_score:Math.max(4,current.interest_score),last_engaged_at:stamp,activated_at:current.activated_at||stamp,dismissed_until:null,updated_at:stamp};
  if(action==='pin')return {...current,state:'pinned',interest_score:Math.max(6,current.interest_score),last_engaged_at:stamp,activated_at:current.activated_at||stamp,dismissed_until:null,updated_at:stamp};
  if(action==='unpin')return {...current,state:'active',last_engaged_at:stamp,dismissed_until:null,updated_at:stamp};
  if(action==='dismiss')return {...current,state:'available',interest_score:clamp(current.interest_score-4,0,10),dismissed_until:iso(new Date(new Date(now).getTime()+30*MS_DAY)),updated_at:stamp};
  if(action==='restore')return {...current,state:'available',dismissed_until:null,updated_at:stamp};
  return current;
}
export function buildPersonalizedServiceView({services=[],connectedIds=[],workspaceIds=[],preferences=[],signals=[],now=new Date(),recommendationLimit=2}={}){
  const nowMs=new Date(now).getTime();
  const connected=new Set(connectedIds);
  const workspace=new Set(workspaceIds);
  const prefMap=new Map(preferences.map(row=>{const pref=normalizePreference(row);return[pref.service_id,pref]}));
  const signalMap=new Map();
  for(const raw of signals){
    const signal=normalizeSignal(raw);
    if(!signal?.service_id)continue;
    const rows=signalMap.get(signal.service_id)||[];rows.push(signal);signalMap.set(signal.service_id,rows);
  }
  const ranked=services.map(service=>{
    const pref=prefMap.get(service.id)||normalizePreference({service_id:service.id});
    const dismissed=time(pref.dismissed_until)>nowMs;
    const state=effectiveState(pref,{connected:connected.has(service.id),nowMs});
    const contextual=workspace.has(service.id)?1.25:0;
    const external=(signalMap.get(service.id)||[]).reduce((sum,signal)=>sum+signalScore(signal,nowMs),0);
    const score=clamp(pref.interest_score+contextual+external,-10,30);
    const connectedService=connected.has(service.id);
    const faded=pref.state==='active'&&state==='available'&&!connectedService;
    return {...service,preference:pref,state,score,dismissed,connected:connectedService,faded};
  });

  const byPriority=(a,b)=>(b.score-a.score)||(a.order||999)-(b.order||999);
  const pinned=ranked.filter(item=>item.state==='pinned').sort(byPriority);
  const active=ranked.filter(item=>item.state==='active').sort((a,b)=>Number(b.connected)-Number(a.connected)||byPriority(a,b));
  const occupied=new Set([...pinned,...active].map(item=>item.id));
  const recommended=ranked.filter(item=>!occupied.has(item.id)&&!item.dismissed&&!item.faded&&item.score>=RECOMMENDATION_THRESHOLD).sort(byPriority).slice(0,recommendationLimit);
  const recommendedIds=new Set(recommended.map(item=>item.id));
  const available=ranked.filter(item=>!occupied.has(item.id)&&!recommendedIds.has(item.id)).sort((a,b)=>(a.dismissed-b.dismissed)||byPriority(a,b));
  return {version:PERSONALIZATION_VERSION,pinned,active,recommended,available,all:ranked};
}