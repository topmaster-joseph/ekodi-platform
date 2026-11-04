import {notificationAdminAuthority} from './notification-admin-authority.js';
import {NOTIFICATION_TOPICS,topicPublisherReadiness} from './notification-control.js';

const PREFIX='/api/notifications/admin/summary';
const TOPICS=Object.keys(NOTIFICATION_TOPICS);
const WINDOWS=Object.freeze({ '7d':7,'30d':30,'all':null });
function metricWindow(now,window) {
  const date=new Date(now);
  if(!Number.isFinite(date.getTime())) throw new Error('invalid_metric_clock');
  const days=WINDOWS[window];
  return days===null ? null : new Date(date.getTime()-days*86400000).toISOString();
}

function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer'
  }});
}
export async function handleNotificationAdminSummary(request,env,{transport=fetch,now=new Date()}={}){
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
  const window=u.searchParams.get('window')||'7d';
  if(!Object.hasOwn(WINDOWS,window))return json({ok:false,error:'invalid_window'},400);
  const cutoff=metricWindow(now,window);
  const stalledBefore=new Date(new Date(now).getTime()-15*60000).toISOString();
  const selected=topic==='all'?visible:[topic];
  const topics=[];
  try {
    for(const key of selected){
      const subscribers=await env.DB.prepare(
        "SELECT count(*) AS n FROM notification_devices d WHERE d.disabled_at IS NULL AND EXISTS (SELECT 1 FROM json_each(d.topics_json) WHERE value=?)"
      ).bind(key).first();
      // Cohort by event creation time. Subscription counts deliberately remain
      // an all-time CURRENT snapshot, not a time-windowed registration count.
      const eventFilter=cutoff?' AND e.created_at>=?':'';
      const delivery=await env.DB.prepare(
        "SELECT count(*) AS total, "+
        "SUM(CASE WHEN d.status='pending' THEN 1 ELSE 0 END) AS pending, "+
        "SUM(CASE WHEN d.status='failed' THEN 1 ELSE 0 END) AS failed, "+
        "SUM(CASE WHEN d.status='delivered' THEN 1 ELSE 0 END) AS delivered, "+
        "SUM(CASE WHEN (d.status='pending' AND d.next_attempt_at<?) "+
        "OR (d.status='processing' AND d.locked_at<?) THEN 1 ELSE 0 END) AS stalled, "+
        "MAX(d.delivered_at) AS lastDeliveredAt "+
        "FROM notification_deliveries d JOIN notification_events e ON e.id=d.event_id "+
        "WHERE e.topic=?"+eventFilter
      ).bind(...(cutoff?[stalledBefore,stalledBefore,key,cutoff]:[stalledBefore,stalledBefore,key])).first();
      const event=await env.DB.prepare(
        "SELECT count(*) AS total, "+
        "SUM(CASE WHEN e.status='pending' THEN 1 ELSE 0 END) AS pending, "+
        "SUM(CASE WHEN e.status='pending' AND e.scheduled_at<? THEN 1 ELSE 0 END) AS overdue, "+
        "MAX(e.created_at) AS lastEventAt FROM notification_events e WHERE e.topic=?"+eventFilter
      ).bind(...(cutoff?[stalledBefore,key,cutoff]:[stalledBefore,key])).first();
      const publisher=topicPublisherReadiness(env,key);
      const saturdayNotice=key==='mission'?{
        enabled:env.NOTIFICATION_MISSION_SATURDAY_NOTICE_ENABLED==='true',
        ready:publisher.ready&&env.NOTIFICATION_MISSION_SATURDAY_NOTICE_ENABLED==='true'
      }:undefined;
      topics.push({
        id:key,label:NOTIFICATION_TOPICS[key],publisher,saturdayNotice,
        subscriberDevices:Number(subscribers?.n||0),
        events:Number(event?.total||0),eventsPending:Number(event?.pending||0),
        eventsOverdue:Number(event?.overdue||0),lastEventAt:event?.lastEventAt||null,
        deliveries:Number(delivery?.total||0),delivered:Number(delivery?.delivered||0),
        pending:Number(delivery?.pending||0),failed:Number(delivery?.failed||0),
        stalled:Number(delivery?.stalled||0),lastDeliveredAt:delivery?.lastDeliveredAt||null
      });
    }
  }catch{
    return json({ok:false,error:'notification_metrics_unavailable'},503);
  }
  return json({ok:true,scope:actor.kind==='platform'?topic:'authorized_sites',
    window,cutoff,subscriberCountScope:'current_active_devices',
    deliveryCountScope:'events_created_in_window',stalledThresholdMinutes:15,
    topics,webPushEnabled:
    env.NOTIFICATIONS_SEND_ENABLED==='true'&&Boolean(env.NOTIFICATION_VAPID_PRIVATE_JWK)&&Boolean(env.NOTIFICATION_VAPID_PUBLIC_KEY),
    updatedAt:new Date().toISOString(),deviceDetailsExposed:false});
}
