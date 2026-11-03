import {notificationAdminAuthority} from './notification-admin-authority.js';
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
export async function handleNotificationAdminSummary(request,env,{transport=fetch}={}){
  const u=new URL(request.url);
  if(u.pathname!==PREFIX)return null;
  if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
  if(!env.DB?.prepare)return json({ok:false,error:'notification_storage_unavailable'},503);
  const actor=await notificationAdminAuthority(request,env,{transport});
  if(!actor)return json({ok:false,error:'notification_admin_required'},403);
  const topic=u.searchParams.get('topic')||'all';
  if(topic!=='all'&&!TOPICS.includes(topic))return json({ok:false,error:'invalid_topic'},400);
  const visible=actor.kind==='platform'?TOPICS:actor.allowedTopics;
  if(topic!=='all'&&!visible.includes(topic))return json({ok:false,error:'topic_access_denied'},403);
  const selected=topic==='all'?visible:[topic];
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
  return json({ok:true,scope:actor.kind==='platform'?topic:'authorized_sites',topics,webPushEnabled:
    env.NOTIFICATIONS_SEND_ENABLED==='true'&&Boolean(env.NOTIFICATION_VAPID_PRIVATE_JWK)&&Boolean(env.NOTIFICATION_VAPID_PUBLIC_KEY),
    updatedAt:new Date().toISOString(),deviceDetailsExposed:false});
}
