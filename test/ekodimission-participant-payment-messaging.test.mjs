import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { workspaceAdminScript, workspaceAdminCss } from '../workspace-admin-page.js';

const migrationUrl=new URL('../supabase/migrations/20261002131500_mission_participant_payments_messaging.sql',import.meta.url);

test('Mission participant payments are tenant scoped and auditable',async()=>{
  const sql=await readFile(migrationUrl,'utf8');
  for(const marker of [
    'payment_status',
    'activity_admin_payment_snapshot',
    'activity_admin_update_payment',
    'payment_update',
    'activity_message_campaigns',
    'activity_admin_message_recipients',
    'activity_admin_record_message',
    'activity_admin_message_history'
  ])assert.ok(sql.includes(marker),marker);
  assert.match(sql,/revoke all on function public\.activity_admin_update_payment[^;]+from public, anon, authenticated;/);
  assert.match(sql,/grant execute on function public\.activity_admin_update_payment[^;]+to authenticated, service_role;/);
  assert.match(sql,/alter table public\.activity_message_campaigns enable row level security;/);
});

test('Mission admin exposes fee state and privacy-safe group email',async()=>{
  const [source,css]=await Promise.all([(await workspaceAdminScript()).text(),(await workspaceAdminCss()).text()]);
  for(const marker of [
    'PAYMENT_STATUS_LABEL',
    'data-payment-status',
    'activity_admin_update_payment',
    'activityMessageButton',
    'activity_admin_message_recipients',
    "mailApi('/accounts')",
    "p_channel:'email'",
    '수신자 주소를 서로 공개하지 않고 참가자별로 개별 이메일'
  ])assert.ok(source.includes(marker),marker);
  assert.ok(css.includes('.activity-payment-summary'));
  assert.ok(css.includes('.activity-select-person'));
});
