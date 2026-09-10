import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { isWorkspaceAdminPath, workspaceAdminScript } from '../workspace-admin-page.js';

test('tenant and service admins use site-local canonical paths', async () => {
  assert.equal(isWorkspaceAdminPath('/ekodibiz/admin/'), true);
  assert.equal(isWorkspaceAdminPath('/ekodibiz/mall/admin/'), true);
  assert.equal(isWorkspaceAdminPath('/jadam/admin/'), true);
  assert.equal(isWorkspaceAdminPath('/jadam/marketing/admin/channels'), true);
  assert.equal(isWorkspaceAdminPath('/admin/'), false);
  assert.equal(isWorkspaceAdminPath('/'+'org'+'/ekodibiz/mall/admin/'), false);
  const siteWorker = await fs.readFile(new URL('../site-worker.js', import.meta.url), 'utf8');
  assert.match(siteWorker, /isLegacyMallPath\(url\.pathname\).*redirectLegacyMallPath/s);
  const js = await workspaceAdminScript().text();
  assert.ok(!js.includes('/'+'org'+'/'));
  assert.match(js, /const base=`\/\$\{workspace\}`/);
  assert.ok(js.startsWith('const __name=(target)=>target;'));
  assert.match(js, /marketing-connect-api\.ekodi\.kr/);
  assert.ok(js.includes('Google로 YouTube 연결'));
  assert.match(js, /subject_type=tenant/);
  assert.ok(js.includes('/auth/v1/verify'));
  assert.ok(js.includes('/auth/v1/token?grant_type=refresh_token'));
  assert.ok(js.includes('token_hash'));
  assert.ok(js.includes('apikey:SUPABASE_KEY'));
  assert.ok(!js.includes("fetch('/api/auth/exchange'"));
  assert.ok(!js.includes("fetch('/api/auth/refresh'"));
});


test('entry gateway redirects legacy Mall admin to the canonical site-local admin', async () => {
  const source = await fs.readFile(new URL('../platform-router-entry-worker.js', import.meta.url), 'utf8');
  assert.match(source, /url\.pathname==='\/mall\/admin'\|\|url\.pathname\.startsWith\('\/mall\/admin\/'\)/);
  const manifest = JSON.parse(await fs.readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8'));
  const probe = manifest.worker.requests.find(item => item.url === 'https://ekodi.kr/mall/admin/');
  assert.ok(probe);
  assert.deepEqual(probe.statuses, [308]);
  assert.equal(probe.rollbackVerify, false);
  assert.ok(probe.headerExpect.includes('location: https://ekodi.kr/ekodibiz/mall/admin/'));
});
