import {handleAdminSessionFastPath} from './admin-session-fastpath.js';
import {NOTIFICATION_TOPICS} from './notification-control.js';

const PREFIX='/api/notifications/admin/summary';
const TOPICS=Object.keys(NOTIFICATION_TOPICS);

function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer'
  }});
}
async function authorized(request,env){
  const sessionUrl=new URL(request.url);
  sessionUrl.pathname='/api/session';sessionUrl.search='';
  const result=await handleAdminSessionFastPath(new Request(sessionUrl,{
    method:'GET',headers:{authorization:request.headers.get('authorization')||''}
  }),env);
  if(!result?.ok)return false;
  const session=await result.json().catch(()=>null);
  return session?.authenticated===true&&session.role==='super_admin';
}
export async function handleNotificationAdminSummary(request,env){
  const u=new URL(request.url);
  if(u.pathname!==PREFIX)return null;
  if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
  if(!env.DB?.prepare)return json({ok:false,error:'notification_storage_unavailable'},503);
  if(!await authorized(request,env))return json({ok:false,error:'super_admin_required'},403);
  const topic=u.searchParams.get('topic')||'all';
  if(topic!=='all'&&!TOPICS.includes(topic))return json({ok:false,error:'invalid_topic'},400);
  const selected=topic==='all'?TOPICS:[topic];
  const topics=[];
  try {
    for(const key of selected){
      const subscribers=await env.DB.prepare(
        "SELECT count(*) AS n FROM notification_devices d WHERE d.disabled_at IS NULL AND EXISTS (SELECT 1 FROM json_each(d.topics_json) WHERE value=?)"
      ).bind(key).first();
      const delivery=await env.DB.prepare(
        "SELECT count(*) AS total, SUM(CASE WHEN d.status='pending' THEN 1 ELSE 0 END) AS pending, "+
        "SUM(CASE WHEN d.status='failed' THEN 1 ELSE 0 END) AS failed, "+
        "SUM(CASE WHEN d.status='delivered' THEN 1 ELSE 0 END) AS delivered "+
        "FROM notification_deliveries d JOIN notification_events e ON e.id=d.event_id WHERE e.topic=?"
      ).bind(key).first();
      const event=await env.DB.prepare(
        "SELECT count(*) AS total, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending "+
        "FROM notification_events WHERE topic=?"
      ).bind(key).first();
      topics.push({
        id:key,label:NOTIFICATION_TOPICS[key],subscriberDevices:Number(subscribers?.n||0),
        events:Number(event?.total||0),eventsPending:Number(event?.pending||0),
        deliveries:Number(delivery?.total||0),delivered:Number(delivery?.delivered||0),
        pending:Number(delivery?.pending||0),failed:Number(delivery?.failed||0)
      });
    }
  }catch{
    return json({ok:false,error:'notification_metrics_unavailable'},503);
  }
  return json({ok:true,scope:topic,topics,webPushEnabled:
    env.NOTIFICATIONS_SEND_ENABLED==='true'&&Boolean(env.NOTIFICATION_VAPID_PRIVATE_JWK)&&Boolean(env.NOTIFICATION_VAPID_PUBLIC_KEY),
    updatedAt:new Date().toISOString(),deviceDetailsExposed:false});
}
