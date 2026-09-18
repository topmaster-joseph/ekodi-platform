import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const control=fs.readFileSync(new URL('../realtime-control.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../migrations/0095_realtime_mobile_camera_sources.sql',import.meta.url),'utf8');

test('mobile camera source flow is room scoped and administrator controlled',()=>{
  assert.match(control,/camera-sources\\/invites/);
  assert.match(control,/room_owner_permission_required/);
  assert.match(control,/camera-sources\\/[^/]+\\\/(approve\|revoke)/);
  assert.match(control,/camera_source_limit_reached/);
});
test('mobile camera source invitations expire and cannot bypass approval',()=>{
  assert.match(control,/camera_source_invite_expired/);
  assert.match(control,/waitingApproval:true/);
  assert.match(control,/source\.status!=='approved'/);
  assert.match(control,/camera_source_invite_revoked/);
});
test('approved camera source receives presenter media session only through controlled claim',()=>{
  assert.match(control,/createCameraSourceSession/);
  assert.match(control,/'presenter'/);
  assert.match(control,/actor_key,role,provider/);
});
test('persistent source state has constrained lifecycle',()=>{
  assert.match(migration,/CHECK\(status IN \('pending','approved','revoked','used','expired'\)\)/);
  assert.match(migration,/CHECK\(status IN \('pending','approved','revoked','connected'\)\)/);
  assert.match(migration,/token_hash TEXT NOT NULL UNIQUE/);
  assert.match(migration,/expires_at TEXT NOT NULL/);
});
