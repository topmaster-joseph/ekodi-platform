import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVOTION_PUSH_POLICY, seoulDate, seoulClock, isDue, deliveryKey, devotionalPushPayload } from '../message/devotion-push-policy.js';
test('no paid channel enabled', () => {
  assert.equal(DEVOTION_PUSH_POLICY.paidTransportEnabled,false);
  assert.deepEqual(DEVOTION_PUSH_POLICY.channels,['web-push']);
});
test('Seoul midnight rollover', () => {
  assert.equal(seoulDate(new Date('2026-10-29T14:59:00Z')),'2026-10-29');
  assert.equal(seoulDate(new Date('2026-10-29T15:00:00Z')),'2026-10-30');
});
test('Seoul morning due minute', () => {
  assert.deepEqual(seoulClock(new Date('2026-10-28T22:00:00Z')),{hour:7,minute:0});
  assert.equal(isDue(new Date('2026-10-28T22:00:00Z')),true);
  assert.equal(isDue(new Date('2026-10-28T22:01:00Z')),false);
});
test('idempotency key is stable per day and endpoint', () => {
  const args={site:'mission',endpointId:'abcdefghijklmnop',now:new Date('2026-10-28T22:00:00Z')};
  assert.equal(deliveryKey(args),deliveryKey(args));
  assert.notEqual(deliveryKey(args),deliveryKey({...args,now:new Date('2026-10-29T22:00:00Z')}));
  assert.throws(()=>deliveryKey({...args,site:'other'}));
});
test('payload only contains canonical devotion page', () => {
  assert.equal(devotionalPushPayload({site:'church'}).url,'https://ekodi.kr/ekodichurch/devotion');
  assert.throws(()=>devotionalPushPayload({site:'other'}));
});
