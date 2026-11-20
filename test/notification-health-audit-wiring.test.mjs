import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('notification audit is scheduled before customers reporting early return',()=>{
  const entry=readFileSync(new URL('../mission-control-entry-worker.js',import.meta.url),'utf8');
  assert.match(entry,/import \{runNotificationHealthAudit\} from '\.\/notification-health-audit\.js'/);
  const scheduled=entry.slice(entry.indexOf('async scheduled(controller, env, ctx)'));
  const audit=scheduled.indexOf('runNotificationHealthAudit(env,');
  const early=scheduled.indexOf('if (customerSchedule?.reporting?.ran) return customerSchedule;');
  assert.ok(audit>=0&&early>audit);
  assert.match(scheduled,/ctx\.waitUntil\(notificationHealthAudit\)/);
  const wrangler=readFileSync(new URL('../wrangler.api.toml',import.meta.url),'utf8');
  assert.match(wrangler,/crons = \["\*\/10 \* \* \* \*"\]/);
});

test('all fleet readbacks avoid added redirects, paid messaging or device identifiers',()=>{
  const audit=readFileSync(new URL('../notification-health-audit.js',import.meta.url),'utf8');
  const api=readFileSync(new URL('../notification-admin-summary.js',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../communication-admin.js',import.meta.url),'utf8');
  assert.doesNotMatch(audit,/sendWebPush\(|sendOperatorNotice\(|fetch\(|Response\.redirect\(/);
  assert.doesNotMatch(audit,/\b(?:d|dev|row)\.(?:endpoint|p256dh|auth_secret|token_hash)\b/);
  assert.match(api,/if\(actor\.kind==='platform'\)\{/);
  assert.match(ui,/audit\.fresh/);
  assert.match(ui,/실기기 수신/);
});
