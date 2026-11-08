import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('admin calendar renders a month grid with edit and delete actions', () => {
  const js = read('church-pastor-admin-page.js');
  const start = js.indexOf('async function calendar(){');
  const body = js.slice(start, js.indexOf('async function ministry(){', start));
  assert.ok(body.includes('acal-grid'));
  assert.ok(body.includes("['일','월','화','수','목','금','토']"));
  assert.ok(body.includes('data-month'));
  assert.ok(body.includes("{method:'PATCH',body}"));
  assert.ok(body.includes("{method:'DELETE'}"));
  assert.ok(body.includes('confirm('));
  assert.ok(read('church-reports-admin.css').includes('.acal-grid'));
});

test('church-pastor-api allows PATCH/DELETE only for church_events via audited RPCs', () => {
  const api = read('supabase/functions/church-pastor-api/index.ts');
  assert.match(api, /'GET,POST,PATCH,DELETE,OPTIONS'/);
  assert.ok(api.includes("if(table!=='church_events')return json({error:'DELETE_NOT_ALLOWED'},405,origin);"));
  assert.ok(api.includes("rpc('church_event_update'"));
  assert.ok(api.includes("rpc('church_event_delete'"));
  // write roles are checked before any update/delete path
  assert.ok(api.indexOf("WRITE_ROLES[table]))return json({error:'ROLE_NOT_ALLOWED'}") < api.indexOf("req.method==='DELETE'"));
});

test('event update/delete RPCs are service-role only and audit logged', () => {
  const sql = read('supabase/migrations/20261108200000_church_event_update_delete.sql');
  assert.equal((sql.match(/service role required/g) || []).length, 2);
  assert.match(sql, /'delete', 'church_events'/);
  assert.match(sql, /'update', 'church_events'/);
  assert.match(sql, /grant execute on function public\.church_event_delete\(text, uuid, uuid\) to service_role;/);
  assert.doesNotMatch(sql, /to anon/);
});
