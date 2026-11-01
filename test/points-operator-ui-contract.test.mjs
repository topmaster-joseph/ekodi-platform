import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const view=fs.readFileSync(new URL('../workspace-admin-page.js',import.meta.url),'utf8');
const gateway=fs.readFileSync(new URL('../space-worker.js',import.meta.url),'utf8');
test('activity participant page provides explicit, operator-initiated points action',()=>{
  assert.ok(view.includes('data-activity-points'));
  assert.ok(view.includes("status!=='attended'"));
  assert.ok(view.includes("activityRpc('ekodi_points_operator_award_attendance'"));
  assert.ok(view.includes('p_participation_id:participationId'));
  assert.ok(view.includes('p_site:workspace'));
  assert.ok(view.includes('btn.disabled=true'));
  assert.ok(view.includes("award?.reason==='DUPLICATE'"));
});
test('mission gateway forwards only allowlisted RPC through the user JWT',()=>{
  const whitelist=gateway.match(/const MISSION_ADMIN_ACTIVITY_RPCS=new Set\(\[[^;]*?\]\);/s)?.[0]||'';
  assert.ok(whitelist.includes("'ekodi_points_operator_award_attendance'"));
  assert.ok(gateway.includes('authorization,'));
  assert.ok(gateway.includes("api/admin/activity-rpc"));
});
