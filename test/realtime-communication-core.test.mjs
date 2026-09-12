import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRoomPolicy, canPerform, sanitizeClientRoom } from '../src/realtime/policy.mjs';
import { RealtimeRoomState } from '../src/realtime/state-machine.mjs';
import { issueRoomToken, verifyRoomToken } from '../src/realtime/token.mjs';

const secret = '0123456789abcdef0123456789abcdef';

test('e2ee rooms fail closed for AI and recording', () => {
  assert.throws(() => assertRoomPolicy({
    mode: 'meeting', securityProfile: 'e2ee', aiEnabled: true,
    recordingEnabled: false, recordingNoticeEnabled: false
  }), /ai_not_allowed/);
  assert.throws(() => assertRoomPolicy({
    mode: 'meeting', securityProfile: 'e2ee', aiEnabled: false,
    recordingEnabled: true, recordingNoticeEnabled: true
  }), /recording_not_allowed/);
});

test('recording notice is mandatory in standard rooms', () => {
  assert.throws(() => assertRoomPolicy({
    mode: 'worship', securityProfile: 'standard', aiEnabled: true,
    recordingEnabled: true, recordingNoticeEnabled: false
  }), /recording_notice_required/);
  assert.equal(assertRoomPolicy({
    mode: 'worship', securityProfile: 'standard', aiEnabled: true,
    recordingEnabled: true, recordingNoticeEnabled: true
  }), true);
});

test('role capabilities are least privilege', () => {
  assert.equal(canPerform('viewer', 'view'), true);
  assert.equal(canPerform('viewer', 'speak'), false);
  assert.equal(canPerform('participant', 'speak'), true);
  assert.equal(canPerform('cohost', 'startStopRecording'), true);
  assert.equal(canPerform('cohost', 'changeRoomPolicy'), false);
  assert.equal(canPerform('owner', 'manageDestinations'), true);
});

test('client room payload strips provider and media secrets', () => {
  const safe = sanitizeClientRoom({
    id: 'r1', title: 'safe', streamKeys: ['secret'], providerSecrets: { x: 'y' },
    providerApiKeys: ['key'], turnSecret: 'turn'
  });
  assert.deepEqual(safe, { id: 'r1', title: 'safe' });
});

test('room tokens are scoped to room, tenant and expiration', () => {
  const now = Date.UTC(2026, 8, 12, 12, 0, 0);
  const token = issueRoomToken({ roomId: 'r1', tenantId: 't1', userId: 'u1', role: 'presenter', secret, ttlSeconds: 60, now });
  const payload = verifyRoomToken(token, { secret, expectedRoomId: 'r1', expectedTenantId: 't1', now: now + 30_000 });
  assert.equal(payload.role, 'presenter');
  assert.throws(() => verifyRoomToken(token, { secret, expectedRoomId: 'r2', expectedTenantId: 't1', now: now + 30_000 }), /room_mismatch/);
  assert.throws(() => verifyRoomToken(token, { secret, expectedRoomId: 'r1', expectedTenantId: 't2', now: now + 30_000 }), /tenant_mismatch/);
  assert.throws(() => verifyRoomToken(token, { secret, expectedRoomId: 'r1', expectedTenantId: 't1', now: now + 61_000 }), /expired/);
});

test('room state isolates component degradation from core live state', () => {
  const room = new RealtimeRoomState({ roomId: 'r1', tenantId: 't1', hostUserId: 'u1', mode: 'public_broadcast', securityProfile: 'standard' });
  room.transition('starting');
  room.transition('live');
  room.activateLanguage('EN');
  room.markDegraded('translation:en');
  room.setDestination('youtube', 'live');
  assert.equal(room.snapshot().status, 'live');
  assert.deepEqual(room.snapshot().activeLanguages, ['en']);
  assert.deepEqual(room.snapshot().degraded, ['translation:en']);
  assert.equal(room.snapshot().destinations.youtube.status, 'live');
});
