// EKODI guarded daily push scheduler. Integration must supply a secure, audited
// RFC 8291 Web Push sender and an atomic delivery-claim storage adapter.
import {isDue,seoulDate,deliveryKey,devotionalPushPayload,DEVOTION_PUSH_POLICY} from './devotion-push-policy.js';
const SITES=['mission','church'];
export async function runDevotionalPushSchedule({now=new Date(),storage,send,devotionPublished,limit=100}={}) {
  if (!isDue(now)) return {status:'not_due',sent:0};
  if (!storage || typeof storage.listActive!=='function' || typeof storage.claimDelivery!=='function'
    || typeof storage.markDelivery!=='function' || typeof send!=='function'
    || typeof devotionPublished!=='function') return {status:'not_configured',sent:0};
  if (!Number.isInteger(limit) || limit<1 || limit>1000) throw new RangeError('Invalid batch limit');
  const date=seoulDate(now);
  let sent=0,failed=0,skipped=0,processed=0;
  for (const site of SITES) {
    if (!(await devotionPublished(site,date))) {skipped++;continue;}
    const subscriptions=await storage.listActive(site,{limit});
    for (const sub of subscriptions) {
      if (processed>=limit) return {status:'batch_limit',sent,failed,skipped,processed,date};
      processed++;
      if (!sub || typeof sub.endpointId!=='string') {skipped++;continue;}
      const key=deliveryKey({site,endpointId:sub.endpointId,now});
      // Claim must be an atomic insert-if-absent, otherwise duplicate sends are possible.
      if (!(await storage.claimDelivery({key,site,subscriptionId:sub.id,date}))) {skipped++;continue;}
      try {
        const payload=devotionalPushPayload({site,now});
        await send(sub,{...payload,site},{transport:'web-push',paidTransportEnabled:DEVOTION_PUSH_POLICY.paidTransportEnabled});
        await storage.markDelivery({key,status:'sent'});
        sent++;
      } catch(error) {
        failed++;
        await storage.markDelivery({key,status:'failed',errorCode:String(error?.code||'send_failed').slice(0,80)});
      }
    }
  }
  return {status:'processed',sent,failed,skipped,processed,date};
}
