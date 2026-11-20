// EKODI-NOTIFICATION-HEALTH-AUDIT-001
// Existing Control API cron records topic delivery health. No notification
// is sent, no subscriber identity/endpoint is logged, and no channel is enabled.
import {NOTIFICATION_TOPICS,topicPublisherReadiness} from './notification-control.js';

export const NOTIFICATION_HEALTH_STATES=Object.freeze([
  'attention','configuration_required','unverified','push_paused','queue_clear'
]);
export const NOTIFICATION_HEALTH_SQL=`CREATE TABLE IF NOT EXISTS notification_health_snapshots (
  topic TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('attention','configuration_required','unverified','push_paused','queue_clear')),
  subscriber_devices INTEGER NOT NULL DEFAULT 0,
  events_24h INTEGER NOT NULL DEFAULT 0,
  failed_24h INTEGER NOT NULL DEFAULT 0,
  stalled INTEGER NOT NULL DEFAULT 0,
  events_overdue INTEGER NOT NULL DEFAULT 0,
  publisher_ready INTEGER NOT NULL DEFAULT 0,
  push_enabled INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  consecutive_attention INTEGER NOT NULL DEFAULT 0
)`;

const asCount=value=>Number.isFinite(Number(value))?Math.max(0,Math.trunc(Number(value))):0;
export function notificationHealthState({publisherReady,sendEnabled,subscribers,events,failed,stalled,overdue}){
  if(asCount(failed)||asCount(stalled)||asCount(overdue))return 'attention';
  if(!publisherReady)return 'configuration_required';
  if(!asCount(subscribers)||!asCount(events))return 'unverified';
  if(!sendEnabled)return 'push_paused';
  // Clear queue is not proof of Web Push acceptance or handset receipt.
  return 'queue_clear';
}

export async function runNotificationHealthAudit(env,{now=new Date(),topics=Object.keys(NOTIFICATION_TOPICS)}={}){
  if(!env?.DB?.prepare)return {ok:false,code:'DB_UNAVAILABLE'};
  const clock=now instanceof Date?now:new Date(now);
  if(!Number.isFinite(clock.getTime()))return {ok:false,code:'INVALID_TIME'};
  const checkedAt=clock.toISOString();
  const overdueAt=new Date(clock.getTime()-15*60*1000).toISOString();
  const windowAt=new Date(clock.getTime()-24*60*60*1000).toISOString();
  // Defensive: scheduled scans may run before a migration is applied.
  await env.DB.prepare(NOTIFICATION_HEALTH_SQL).run();
  const sendEnabled=env.NOTIFICATIONS_SEND_ENABLED==='true' &&
    Boolean(env.NOTIFICATION_VAPID_PUBLIC_KEY) && Boolean(env.NOTIFICATION_VAPID_PRIVATE_JWK);
  const registered=new Set(Object.keys(NOTIFICATION_TOPICS));
  const selected=[...new Set(topics)].filter(topic=>registered.has(topic));
  const results=[];
  for(const topic of selected){
    const [devices,event,delivery,overdue]=await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS n FROM notification_devices d
        WHERE d.disabled_at IS NULL AND EXISTS
        (SELECT 1 FROM json_each(d.topics_json) WHERE value=?)`).bind(topic).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM notification_events
        WHERE topic=? AND created_at>=?`).bind(topic,windowAt).first(),
      env.DB.prepare(`SELECT
        SUM(CASE WHEN d.status='failed' AND e.created_at>=? THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN (d.status='pending' AND d.next_attempt_at<?) OR
          (d.status='processing' AND d.locked_at<?) THEN 1 ELSE 0 END) AS stalled
        FROM notification_deliveries d JOIN notification_events e ON e.id=d.event_id
        WHERE e.topic=?`).bind(windowAt,overdueAt,overdueAt,topic).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM notification_events
        WHERE topic=? AND status='pending' AND scheduled_at<?`).bind(topic,overdueAt).first()
    ]);
    const publisherReady=topicPublisherReadiness(env,topic).ready;
    const metrics={
      subscribers:asCount(devices?.n),events:asCount(event?.n),
      failed:asCount(delivery?.failed),stalled:asCount(delivery?.stalled),
      overdue:asCount(overdue?.n),publisherReady,sendEnabled
    };
    const state=notificationHealthState(metrics);
    await env.DB.prepare(`INSERT INTO notification_health_snapshots
      (topic,state,subscriber_devices,events_24h,failed_24h,stalled,events_overdue,
        publisher_ready,push_enabled,checked_at,changed_at,consecutive_attention)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(topic) DO UPDATE SET
        state=excluded.state,subscriber_devices=excluded.subscriber_devices,
        events_24h=excluded.events_24h,failed_24h=excluded.failed_24h,
        stalled=excluded.stalled,events_overdue=excluded.events_overdue,
        publisher_ready=excluded.publisher_ready,push_enabled=excluded.push_enabled,
        checked_at=excluded.checked_at,
        changed_at=CASE WHEN notification_health_snapshots.state=excluded.state
          THEN notification_health_snapshots.changed_at ELSE excluded.changed_at END,
        consecutive_attention=CASE WHEN excluded.state='attention'
          THEN CASE WHEN notification_health_snapshots.state='attention'
            THEN notification_health_snapshots.consecutive_attention+1 ELSE 1 END
          ELSE 0 END`)
      .bind(topic,state,metrics.subscribers,metrics.events,metrics.failed,metrics.stalled,
        metrics.overdue,Number(publisherReady),Number(sendEnabled),checkedAt,checkedAt,
        state==='attention'?1:0).run();
    results.push({topic,state,...metrics});
  }
  return {ok:true,checkedAt,topicCount:results.length,
    attention:results.filter(row=>row.state==='attention').length,
    configurationRequired:results.filter(row=>row.state==='configuration_required').length,
    // No publishing permissions or production receiver claims are inferred.
    liveHandsetReceiptVerified:false};
}
