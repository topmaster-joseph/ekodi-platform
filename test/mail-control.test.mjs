import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Mail control is tenant-scoped, provider-neutral and seeds the EKODI Church forwarding intent', async () => {
  const control = await read('mail-control.js');
  assert.match(control, /current_site_activity_contexts/);
  assert.match(control, /workspace_id TEXT NOT NULL/);
  assert.match(control, /mail_control_audit/);
  assert.match(control, /forward-email/);
  assert.match(control, /mx1\.forwardemail\.net/);
  assert.match(control, /destinationVisibleInPublicDns/);
  assert.match(control, /ekodichurch\.kr/);
  assert.match(control, /ekodichurch@gmail\.com/);
  assert.match(control, /'joseph'/);
  assert.match(control, /outbound_status TEXT NOT NULL DEFAULT 'not_configured'/);
  assert.match(control, /send_enabled INTEGER NOT NULL DEFAULT 0/);
  assert.doesNotMatch(control, /GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY/);
});

test('Control API exposes mail control before generic OPTIONS routing', async () => {
  const api = await read('api-worker.js');
  assert.match(api, /import \{ handleMailControl \} from '\.\/mail-control\.js'/);
  const mail = api.indexOf("url.pathname.startsWith('/api/mail/control')");
  const options = api.indexOf("if (request.method === 'OPTIONS') return authWorker.fetch", mail);
  assert.ok(mail > 0 && options > mail, 'mail control must handle its own CORS preflight');
  assert.match(api, /await handleMailControl\(request, env\)/);
});

test('Workspace admin includes tenant-local Mail management under the canonical org path', async () => {
  const admin = await read('workspace-admin-page.js');
  assert.match(admin, /\['mail','메일'\]/);
  assert.match(admin, /api\.ekodi\.kr\/api\/mail\/control/);
  assert.match(admin, /ekodi-workspace-admin-session/);
  assert.match(admin, /\/api\/auth\/exchange/);
  assert.match(admin, /'ekodi-church':'에코디교회'/);
  assert.match(admin, /DNS 다시 확인/);
  assert.match(admin, /발신 미설정/);
  assert.match(admin, /isWorkspaceAdminPath/);
});

test('Mail schema migration stays additive and does not seed a guessed immutable workspace id', async () => {
  const migration = await read('migrations/0050_mail_control.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS mail_domains/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS mail_routes/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS mail_control_audit/);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+mail_domains/i);
});
