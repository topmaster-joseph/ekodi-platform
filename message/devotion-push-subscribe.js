// Web Push subscription UI helper. Invoke subscribeDevotionalPush from a direct button click.
// The API is intentionally fail-closed until /api/message/devotional-push is deployed.
import {pushCapability,requestDevotionalPushPermission} from './devotion-push-client.js';
function decodeBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{40,200}$/.test(value)) throw new TypeError('Invalid VAPID public key');
  const padded = value.replace(/-/g,'+').replace(/_/g,'/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length/4)*4,'='));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
export async function subscribeDevotionalPush({site, publicKey, endpoint='/api/message/devotional-push'}={}) {
  if (site !== 'mission' && site !== 'church') throw new TypeError('Invalid site');
  if (!pushCapability().supported) return {ok:false,reason:'unsupported'};
  const permission = await requestDevotionalPushPermission();
  if (!permission.ok) return permission;
  const registration = await navigator.serviceWorker.register('/devotion-push-sw.js',{scope:'/'});
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly:true,applicationServerKey:decodeBase64Url(publicKey)
  });
  const response = await fetch(endpoint,{
    method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({site,consentVersion:'devotional-push-v1',subscription:subscription.toJSON()})
  });
  if (!response.ok) {
    // Do not leave an untracked subscription behind when the server rejects enrollment.
    if (!existing) await subscription.unsubscribe().catch(()=>{});
    return {ok:false,reason:'server_rejected',status:response.status};
  }
  return {ok:true};
}
export async function unsubscribeDevotionalPush({site,endpoint='/api/message/devotional-push'}={}) {
  if (site !== 'mission' && site !== 'church') throw new TypeError('Invalid site');
  if (!('serviceWorker' in navigator)) return {ok:false,reason:'unsupported'};
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return {ok:true,alreadyUnsubscribed:true};
  const response = await fetch(endpoint,{
    method:'DELETE',credentials:'same-origin',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({site,endpoint:subscription.endpoint})
  });
  if (!response.ok) return {ok:false,reason:'server_rejected',status:response.status};
  // One browser push subscription may be shared by multiple EKODI sites.
  // Do not unsubscribe at browser level until all sites are removed server-side.
  return {ok:true};
}
