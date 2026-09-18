import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const control=fs.readFileSync(new URL('../realtime-control.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../migrations/0095_realtime_mobile_camera_sources.sql',import.meta.url),'utf8');
test('mobile camera source flow is room scoped and administrator controlled',()=>{for(const term of ['cameraSourceRoute','camera_source_limit_reached','room_owner_permission_required','approve|revoke','realtime_camera_sources'])assert.ok(control.includes(term),term)});
test('mobile camera invitations expire, revoke and wait for explicit approval',()=>{for(const term of ['camera_source_invite_expired','camera_source_invite_revoked','waitingApproval:true',"source.status!=='approved'"])assert.ok(control.includes(term),term)});
test('approved source gets a controlled presenter session',()=>{for(const term of ['createCameraSourceSession',"'presenter'",'camera-source:${source.id}'])assert.ok(control.includes(term),term)});
test('persistent state constrains token and lifecycle',()=>{assert.ok(migration.includes('token_hash TEXT NOT NULL UNIQUE'));assert.ok(migration.includes('expires_at TEXT NOT NULL'));assert.ok(migration.includes("'pending','approved','revoked','used','expired'"));assert.ok(migration.includes("'pending','approved','revoked','connected'"))});
