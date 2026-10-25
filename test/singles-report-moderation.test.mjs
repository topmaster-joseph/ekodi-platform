import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../supabase/migrations/20261025130000_singles_report_moderation.sql',import.meta.url),'utf8');
const surface=await readFile(new URL('../singles-surface.js',import.meta.url),'utf8');
const app=await readFile(new URL('../sites/ekodi-singles/public/app.js',import.meta.url),'utf8');

test('review function enforces reviewer, conflict of interest, transitions and audit',()=>{
  const fn=sql.slice(sql.indexOf('create or replace function public.singles_report_review'));
  assert.match(fn,/singles_report_operators where user_id=p_operator and enabled=true and can_review=true/);
  assert.match(fn,/for update/);
  assert.ok(fn.indexOf('operator_conflict_of_interest')>fn.indexOf('for update'));
  assert.ok(fn.indexOf('operator_conflict_of_interest')<fn.indexOf('update public.singles_reports'),'checks before writing');
  assert.match(fn,/r\.status='open' or \(r\.status='under_review' and p_status in \('resolved','dismissed'\)\)/);
  assert.match(fn,/resolution_note_required/);
  assert.match(fn,/insert into public\.singles_report_audit\(report_id,actor_id,from_status,to_status,note\)/);
});
test('moderation objects are server-only',()=>{
  assert.match(sql,/alter table public\.singles_report_operators enable row level security;/);
  assert.match(sql,/alter table public\.singles_report_audit enable row level security;/);
  assert.match(sql,/revoke all on table public\.singles_report_operators,public\.singles_report_audit from public,anon,authenticated;/);
  assert.match(sql,/grant select on table public\.singles_report_operators to service_role;/);
  assert.match(sql,/revoke all on function public\.singles_report_review\(uuid,uuid,text,text\) from public,anon,authenticated;/);
  assert.doesNotMatch(sql,/grant[^;]*singles_report_operators[^;]*(insert|update)/i,'reviewer roles are granted by migration/DBA only');
});
test('worker allowlist exposes only the moderation routes',()=>{
  assert.match(surface,/\/\^\\\/api\\\/admin\\\/reports\\\/\(\?:open\|under_review\|resolved\|dismissed\)\$\/\.test\(path\)&&method==='GET'/);
  assert.match(surface,/\/\^\\\/api\\\/admin\\\/reports\\\/\[0-9a-f-\]\{36\}\\\/review\$\/i\.test\(path\)&&method==='POST'/);
});
test('admin page renders the moderation panel with text-only DOM',()=>{
  assert.match(app,/await showEventPricing\(h\);await showReportModeration\(h\);/);
  const panel=app.slice(app.indexOf('async function showReportModeration'),app.indexOf('async function showEventPricing'));
  assert.doesNotMatch(panel,/innerHTML|insertAdjacentHTML|outerHTML/);
  assert.match(panel,/confirm\(/);
});
