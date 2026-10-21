// EKODI Education Live — classroom run state.
// The instructor's console, presenter window and audience window on the same computer share one state
// through localStorage + BroadcastChannel (no server, no account data). Timers are stored as absolute
// timestamps so a refresh, crash or second window restores the exact remaining time.

export const STATE_VERSION=1;
export const STATE_PREFIX='ekodi_edu_live_v1:';
export const CHANNEL_NAME='ekodi-edu-live-v1';

export function initialState(courseId,sessionNo=1){
  return {
    v:STATE_VERSION,courseId,session:sessionNo,moduleIndex:0,slideIndex:0,
    lecture:{status:'idle',startedAt:0,accumulatedMs:0},
    timer:{status:'idle',missionId:'',durationMs:0,endsAt:0,remainingMs:0},
    shared:{missionId:'',level:'basic'},
    blackout:false,rev:0,updatedAt:0
  };
}

export function lectureElapsedMs(state,now){
  const l=state.lecture;
  return l.accumulatedMs+(l.status==='running'?Math.max(0,now-l.startedAt):0);
}
export function timerRemainingMs(state,now){
  const t=state.timer;
  if(t.status==='running')return Math.max(0,t.endsAt-now);
  return t.remainingMs;
}
export function timerPhase(state,now,warnMs=5*60*1000){
  const t=state.timer;
  if(t.status==='idle')return 'idle';
  const left=timerRemainingMs(state,now);
  if(left<=0)return 'done';
  if(t.status==='paused')return 'paused';
  if(left<=60*1000)return 'final';
  if(left<=warnMs)return 'warn';
  return 'running';
}

// Pure reducer: every UI surface dispatches the same actions.
export function reduce(state,action,now){
  const s=structuredCloneSafe(state);
  const a=action||{};
  switch(a.type){
    case 'lecture/start':
      if(s.lecture.status==='running')return state;
      s.lecture={status:'running',startedAt:now,accumulatedMs:s.lecture.status==='ended'?0:s.lecture.accumulatedMs};break;
    case 'lecture/pause':
      if(s.lecture.status!=='running')return state;
      s.lecture={status:'paused',startedAt:0,accumulatedMs:lectureElapsedMs(state,now)};break;
    case 'lecture/end':
      s.lecture={status:'ended',startedAt:0,accumulatedMs:lectureElapsedMs(state,now)};
      if(s.timer.status==='running')s.timer={...s.timer,status:'paused',remainingMs:timerRemainingMs(state,now),endsAt:0};
      break;
    case 'lecture/reset':
      s.lecture={status:'idle',startedAt:0,accumulatedMs:0};break;
    case 'session/set':{
      const next=Number(a.session);if(!Number.isInteger(next)||next<1)return state;
      s.session=next;s.moduleIndex=0;s.slideIndex=0;s.lecture={status:'idle',startedAt:0,accumulatedMs:0};
      s.timer={status:'idle',missionId:'',durationMs:0,endsAt:0,remainingMs:0};s.shared={...s.shared,missionId:''};break;}
    case 'module/set':{
      const i=Number(a.index);if(!Number.isInteger(i)||i<0)return state;
      s.moduleIndex=i;if(Number.isInteger(a.slideIndex))s.slideIndex=a.slideIndex;break;}
    case 'slide/set':{
      const i=Number(a.index);if(!Number.isInteger(i)||i<0)return state;
      s.slideIndex=i;if(Number.isInteger(a.moduleIndex))s.moduleIndex=a.moduleIndex;break;}
    case 'timer/start':{
      const duration=Math.max(1000,Math.min(4*60*60*1000,Number(a.durationMs)||0));
      s.timer={status:'running',missionId:String(a.missionId||''),durationMs:duration,endsAt:now+duration,remainingMs:duration};
      if(a.missionId)s.shared={...s.shared,missionId:String(a.missionId)};
      break;}
    case 'timer/pause':
      if(s.timer.status!=='running')return state;
      s.timer={...s.timer,status:'paused',remainingMs:timerRemainingMs(state,now),endsAt:0};break;
    case 'timer/resume':
      if(s.timer.status!=='paused')return state;
      s.timer={...s.timer,status:'running',endsAt:now+s.timer.remainingMs};break;
    case 'timer/add':{
      const delta=Number(a.ms)||0;
      if(s.timer.status==='running')s.timer.endsAt=Math.max(now,s.timer.endsAt+delta);
      else if(s.timer.status==='paused')s.timer.remainingMs=Math.max(0,s.timer.remainingMs+delta);
      else return state;
      s.timer.durationMs=Math.max(0,s.timer.durationMs+delta);break;}
    case 'timer/reset':
      s.timer={status:'idle',missionId:s.timer.missionId,durationMs:0,endsAt:0,remainingMs:0};break;
    case 'share/mission':
      s.shared={...s.shared,missionId:String(a.missionId||'')};
      if(a.level)s.shared.level=String(a.level);
      break;
    case 'share/level':
      s.shared={...s.shared,level:String(a.level||'basic')};break;
    case 'blackout/toggle':
      s.blackout=!s.blackout;break;
    case 'blackout/set':
      s.blackout=Boolean(a.value);break;
    default:return state;
  }
  s.rev=(state.rev||0)+1;s.updatedAt=now;
  return s;
}
function structuredCloneSafe(value){return JSON.parse(JSON.stringify(value));}

export function sanitizeState(raw,courseId){
  const base=initialState(courseId);
  if(!raw||typeof raw!=='object'||raw.v!==STATE_VERSION||raw.courseId!==courseId)return base;
  const pick=(obj,keys,fallback)=>{const out={...fallback};for(const k of keys)if(obj&&obj[k]!==undefined&&typeof obj[k]===typeof fallback[k])out[k]=obj[k];return out;};
  return {
    ...base,
    session:Number.isInteger(raw.session)&&raw.session>0?raw.session:1,
    moduleIndex:Number.isInteger(raw.moduleIndex)&&raw.moduleIndex>=0?raw.moduleIndex:0,
    slideIndex:Number.isInteger(raw.slideIndex)&&raw.slideIndex>=0?raw.slideIndex:0,
    lecture:pick(raw.lecture,['status','startedAt','accumulatedMs'],base.lecture),
    timer:pick(raw.timer,['status','missionId','durationMs','endsAt','remainingMs'],base.timer),
    shared:pick(raw.shared,['missionId','level'],base.shared),
    blackout:raw.blackout===true,
    rev:Number.isInteger(raw.rev)?raw.rev:0,
    updatedAt:Number.isFinite(raw.updatedAt)?raw.updatedAt:0
  };
}

// Browser store. Storage or BroadcastChannel may be unavailable (private mode, old browsers):
// the store then still works in memory, and the UI offers a manual "동기화" button.
export function createLiveStore({courseId,storage,channel,now=()=>Date.now(),onChange=()=>{}}){
  const key=STATE_PREFIX+courseId;
  let state=initialState(courseId);
  let persisted=false;
  const read=()=>{try{const raw=storage?.getItem(key);return raw?sanitizeState(JSON.parse(raw),courseId):null;}catch{return null;}};
  const write=next=>{try{storage?.setItem(key,JSON.stringify(next));persisted=true;}catch{persisted=false;}};
  const restored=read();
  if(restored){state=restored;persisted=true;}
  const adopt=(next,source)=>{
    if(!next||next.courseId!==courseId)return;
    if(next.rev<state.rev||(next.rev===state.rev&&next.updatedAt<=state.updatedAt))return;
    state=next;onChange(state,source);
  };
  channel?.addEventListener?.('message',event=>adopt(sanitizeState(event.data,courseId),'channel'));
  return {
    get state(){return state;},
    get persisted(){return persisted;},
    dispatch(action){
      const next=reduce(state,action,now());
      if(next===state)return state;
      state=next;write(state);
      try{channel?.postMessage(state);}catch{}
      onChange(state,'local');
      return state;
    },
    resync(){const latest=read();if(latest){adopt(latest,'storage');}return state;},
    onStorage(event){if(event?.key===key&&event.newValue){try{adopt(sanitizeState(JSON.parse(event.newValue),courseId),'storage');}catch{}}},
    clear(){try{storage?.removeItem(key);}catch{}state=initialState(courseId);onChange(state,'local');}
  };
}
