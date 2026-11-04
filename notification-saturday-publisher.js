// Saturday meeting notifications: a gated public-calendar adapter.
// No new credentials, DB tables, or worker. The existing signed event API is
// authoritative; this scheduler only derives one public event from official data.
import {handleNotificationApi,topicPublisherReadiness} from './notification-control.js';

const SOURCE='https://ekodi.kr/ekodimission/board/api/saturday';
const EVENT_URL='https://ekodi.kr/api/notifications/events';
const ONE_DAY=86400000;

function seoulParts(now){
  const date=new Date(now);
  if(!Number.isFinite(date.getTime()))return null;
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',
    hourCycle:'h23',weekday:'short'
  }).formatToParts(date);
  const get=type=>parts.find(p=>p.type===type)?.value||'';
  return {day:[get('year'),get('month'),get('day')].join('-'),
    hour:Number(get('hour')),weekday:get('weekday')};
}
function tomorrow(day){
  const date=new Date(day+'T00:00:00Z');
  if(!Number.isFinite(date.getTime()))return '';
  return new Date(date.getTime()+ONE_DAY).toISOString().slice(0,10);
}
function publicField(value,max=70){
  return typeof value==='string' ? value.trim().replace(/[\r\n\t]+/g,' ').slice(0,max) : '';
}
function seoulTime(value){
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||'')))return '';
  const [hours,minutes]=value.split(':').map(Number);
  return (hours>=12?'오후 ':'오전 ')+(hours%12||12)+'시'+(minutes?' '+minutes+'분':'');
}
export function missionSaturdayNoticeWindow(now=new Date()){
  const parts=seoulParts(now);
  if(!parts||parts.weekday!=='Fri'||parts.hour!==9)return null;
  return tomorrow(parts.day);
}
export function missionSaturdayNoticeEvent(meeting,{now=new Date()}={}){
  const expected=missionSaturdayNoticeWindow(now);
  if(!expected||meeting?.status!=='scheduled'||meeting.date!==expected)return null;
  // Only an upcoming, valid Saturday and an explicitly provided local start time.
  if(new Date(expected+'T00:00:00Z').getUTCDay()!==6)return null;
  const hour=seoulTime(meeting.time);
  if(!hour)return null;
  const place=publicField(meeting.venue,60);
  if(!place)return null;
  return {
    idempotencyKey:'mission:saturday:'+expected.replaceAll('-','')+':reminder',
    serviceId:'mission',
    topic:'mission',
    title:'에코디선교회 토요모임 안내',
    body:`${expected} (토) ${hour}, ${place}에서 만납니다. 참여 신청 및 상세 일정을 확인해 주세요.`.slice(0,240),
    targetPath:'/ekodimission?meeting='+expected+'#saturday'
  };
}
export async function runMissionSaturdayNotice(env,{now=new Date(),transport=fetch,emit=handleNotificationApi}={}){
  // Separate campaign flag, topic isolation and topic-specific signing key.
  if(env?.NOTIFICATION_MISSION_SATURDAY_NOTICE_ENABLED!=='true')return {status:'disabled'};
  const readiness=topicPublisherReadiness(env,'mission');
  if(!readiness.ready)return {status:'publisher_not_ready'};
  const expected=missionSaturdayNoticeWindow(now);
  if(!expected)return {status:'outside_window'};
  let meeting;
  try{
    const response=await transport(SOURCE,{method:'GET',headers:{accept:'application/json'},
      signal:AbortSignal.timeout(7000),cache:'no-store'});
    if(!response.ok)return {status:'source_unavailable'};
    const result=await response.json();
    // No replies, accounts, or attendee names cross the notification boundary.
    if(result?.ok!==true)return {status:'source_unavailable'};
    meeting=result.meeting;
  }catch(error){
    console.error('Mission meeting notice source unavailable',String(error?.name||'network_error'));
    return {status:'source_unavailable'};
  }
  const event=missionSaturdayNoticeEvent(meeting,{now});
  if(!event)return {status:'not_scheduled'};
  const key=String(env.NOTIFICATION_EVENT_SECRET_MISSION);
  // Invoke the same signed ingestion path as every external producer.
  const request=new Request(EVENT_URL,{method:'POST',
    headers:{'content-type':'application/json','x-ekodi-notification-secret':key},
    body:JSON.stringify(event)});
  try{
    const result=await emit(request,env);
    if(result?.status!==202)return {status:'rejected',code:result?.status||503};
    return {status:'accepted',date:expected};
  }catch(error){
    console.error('Mission meeting notice event rejected',String(error?.name||'event_error'));
    return {status:'event_unavailable'};
  }
}
