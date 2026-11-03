// Notification publisher adapter for an explicitly published DAILY devotion.
// The Bible service owns publication; this adapter crosses the service boundary
// only through the canonical signed API, never another service's private D1.
const ENDPOINT='https://ekodi.kr/api/notifications/events';
const SERVICE_TOPICS=Object.freeze({
  church:{flag:'NOTIFICATION_PUBLISH_CHURCH_ENABLED',secret:'NOTIFICATION_EVENT_SECRET_CHURCH',path:'/ekodichurch/'},
  mission:{flag:'NOTIFICATION_PUBLISH_MISSION_ENABLED',secret:'NOTIFICATION_EVENT_SECRET_MISSION',path:'/ekodimission/'}
});
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
export function seoulNotificationDate(now=new Date()) {
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function devotionalNotificationEvent(topic,{date,passage,now=new Date()}={}) {
  const conf=SERVICE_TOPICS[topic];
  if(!conf||!datePattern.test(String(date||''))||date!==seoulNotificationDate(now)) return null;
  if(typeof passage!=='string'||!passage.trim())return null;
  return {
    idempotencyKey:`${topic}:devotion:${date.replaceAll('-','')}`,
    serviceId:topic,topic,
    title:'에코디 매일묵상',
    body:`오늘의 말씀 ${passage.trim().slice(0,150)} · 매일묵상이 발행되었습니다.`.slice(0,240),
    targetPath:conf.path
  };
}
export async function publishDevotionalNotifications(env,{date,passage,now=new Date(),transport=fetch}={}) {
  const receipts=[];
  for(const [topic,conf] of Object.entries(SERVICE_TOPICS)){
    if(env?.[conf.flag]!=='true'){receipts.push({topic,status:'disabled'});continue;}
    const event=devotionalNotificationEvent(topic,{date,passage,now});
    if(!event){receipts.push({topic,status:'not_current_published_day'});continue;}
    const secret=String(env?.[conf.secret]||'');
    if(secret.length<32){receipts.push({topic,status:'secret_unavailable'});continue;}
    try {
      const response=await transport(ENDPOINT,{
        method:'POST',
        headers:{'content-type':'application/json','x-ekodi-notification-secret':secret},
        body:JSON.stringify(event),
        signal:AbortSignal.timeout(4000)
      });
      receipts.push({topic,status:response.status===202?'accepted':'rejected',code:response.status});
    }catch(error){
      // Do not log payload, device identifiers or credentials.
      console.error('Devotion notification publisher unavailable',topic,String(error?.name||'transport_error'));
      receipts.push({topic,status:'transport_unavailable'});
    }
  }
  return receipts;
}
