import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const admin = await readFile(new URL('../device-control-admin.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../device-control-admin.css', import.meta.url), 'utf8');

// Evaluate only the pure projection helpers: no live DOM, network or mutation.
const start = admin.indexOf('  function rosterGroupKey(device) {');
const end = admin.indexOf('  function renderTypeFilters(devices) {', start);
assert.ok(start >= 0 && end > start, 'pure roster projection functions must be present');
const model = runInNewContext(admin.slice(start, end) + '\n({ rosterGroupKey, groupRosterDevices, rosterNeedsAttention })');

const record = (id, hostname, status='offline', opts={}) => ({
  id, hostname, status, platform:opts.platform || 'windows',
  label:opts.label || hostname, management:{ type:opts.type || 'pc', locationLabel:opts.location || '' },
  lastSeenAt: opts.lastSeenAt || '2026-10-09T00:00:00Z', enrolledAt:'2026-10-01T00:00:00Z',
  health: { score: opts.score === undefined ? null : opts.score },
});

function groups(devices) { return JSON.parse(JSON.stringify(model.groupRosterDevices(devices))); }

test('the same Windows hostname is one visible group while every enrollment ID survives', () => {
  const one = record('dev-a', 'USER2', 'offline', {lastSeenAt:'2026-10-07T00:00:00Z'});
  const two = record('dev-b', 'user2', 'online', {lastSeenAt:'2026-10-09T00:00:00Z'});
  const actual = groups([one, two]);
  assert.equal(actual.length, 1);
  assert.equal(actual[0].records.length, 2);
  assert.equal(actual[0].primary.id, 'dev-b', 'online Agent must be the representative');
  assert.deepEqual(actual[0].records.map(item => item.id), ['dev-b','dev-a']);
});

test('duplicate API rows of an identical device ID display only once', () => {
  const a = record('dev-unique', 'USER3');
  const result = groups([a, {...a}, a]);
  assert.equal(result.length, 1);
  assert.equal(result[0].records.length, 1);
});

test('hostname alone never merges different device types or unverified inventory identities', () => {
  const result = groups([
    record('dev-pc', 'SHARED', 'online'),
    record('dev-pos', 'SHARED', 'offline', {type:'pos'}),
    record('inv-a', '', 'inventory', {platform:'inventory',label:'SHARED'}),
    record('inv-b', '', 'inventory', {platform:'inventory',label:'SHARED'}),
  ]);
  assert.equal(result.length, 4);
  assert.equal(new Set(result.map(item => item.key)).size, 4);
});

test('generic or missing hostname must not combine unrelated Windows machines', () => {
  const actual = groups([record('dev-1', 'unknown'), record('dev-2', 'UNKNOWN'), record('dev-3', '')]);
  assert.equal(actual.length, 3);
});

test('revoked historical records remain accessible under the active hostname group', () => {
  const actual = groups([record('dev-old', 'USER4', 'revoked'),record('dev-new','USER4','online')]);
  assert.equal(actual.length, 1);
  assert.equal(actual[0].retired, false);
  assert.equal(actual[0].records.length, 2);
  assert.equal(actual[0].primary.id, 'dev-new');
  const retired = groups([record('dev-retired','INACTIVE','revoked')]);
  assert.equal(retired[0].retired,true);
});

test('status and health attention apply to representative Agent rather than stale historical entries', () => {
  const actual = groups([
    record('dev-old','PCX','offline'),
    record('dev-new','PCX','online',{score:97}),
    record('dev-unhealthy','PCY','online',{score:65}),
  ]);
  assert.equal(model.rosterNeedsAttention(actual.find(group=>group.primary.id==='dev-new').primary),false);
  assert.equal(model.rosterNeedsAttention(actual.find(group=>group.primary.id==='dev-unhealthy').primary),true);
  const unknown = record('dev-new-health','PCZ','online');
  assert.equal(model.rosterNeedsAttention(unknown),false,'missing score must not be treated as zero');
});

test('compact roster is searchable, keyboard-accessible, lazy and non-destructive', () => {
  for (const marker of [
    'deviceRosterSearch','deviceRosterStatus','deviceRosterShowRetired','deviceRosterOverview',
    'device-roster-group','device-roster-record','openRosterGroups','openRosterRecords','aria-pressed',
    'currentDevices','groupRosterDevices','recordBody.replaceChildren()','device.id',
  ]) assert.ok(admin.includes(marker), marker);
  assert.match(admin, /<details class="device-status-tools" open>/);
  assert.match(admin, /if \(list\.contains\(document\.activeElement\)/);
  assert.doesNotMatch(admin.slice(start,end), /\b(fetch|localStorage|sessionStorage|DELETE|revoke)\b/);
  assert.match(css, /\.device-roster-summary:focus-visible/);
  assert.match(css, /@media\(max-width:620px\)/);
});
