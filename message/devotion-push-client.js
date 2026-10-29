// EKODI Web Push opt-in helper. Call only after an explicit user gesture.
// No subscription is saved until the authenticated server API is implemented.
export function pushCapability() {
  return { supported: typeof window !== 'undefined' && window.isSecureContext
    && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    permission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission };
}
export async function requestDevotionalPushPermission() {
  const capability = pushCapability();
  if (!capability.supported) return {ok:false,reason:'unsupported'};
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return {ok:false,reason:'permission_' + permission};
  return {ok:true,permission};
}
// Deliberately no register()/subscribe() call until VAPID public key and secure API are ready.
