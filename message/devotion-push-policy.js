// EKODI free devotional notification policy. No paid transport is permitted.
// The push transport and credential provisioning are separate guarded deployment tasks.
export const DEVOTION_PUSH_POLICY = Object.freeze({
  timezone: 'Asia/Seoul',
  hour: 7,
  minute: 0,
  channels: Object.freeze(['web-push']),
  paidTransportEnabled: false,
  sites: Object.freeze({
    mission: 'https://ekodi.kr/ekodimission/devotion',
    church: 'https://ekodi.kr/ekodichurch/devotion',
  }),
});
export function seoulDate(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('Invalid date');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DEVOTION_PUSH_POLICY.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function seoulClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: DEVOTION_PUSH_POLICY.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  return {hour: Number(parts.find(p=>p.type==='hour')?.value), minute: Number(parts.find(p=>p.type==='minute')?.value)};
}
export function isDue(now = new Date()) {
  const clock = seoulClock(now);
  return clock.hour === DEVOTION_PUSH_POLICY.hour && clock.minute === DEVOTION_PUSH_POLICY.minute;
}
export function deliveryKey({site, endpointId, now = new Date()}) {
  if (!Object.hasOwn(DEVOTION_PUSH_POLICY.sites,site)) throw new Error('Unknown site');
  if (typeof endpointId !== 'string' || !/^[a-zA-Z0-9_-]{12,128}$/.test(endpointId)) throw new Error('Invalid endpoint id');
  return `devotion:${site}:${seoulDate(now)}:${endpointId}`;
}
export function devotionalPushPayload({site, now = new Date()}) {
  const url = DEVOTION_PUSH_POLICY.sites[site];
  if (!url) throw new Error('Unknown site');
  return {
    title: '오늘의 매일묵상',
    body: '오늘의 말씀을 확인하세요.',
    url,
    date: seoulDate(now),
    tag: `devotion-${site}-${seoulDate(now)}`,
  };
}
