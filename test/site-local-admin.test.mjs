import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import platformEntry from '../platform-router-entry-worker.js';
import { isWorkspaceAdminPath, workspaceAdminScript } from '../workspace-admin-page.js';

test('tenant admins use the canonical root admin tree while legacy Mall admin remains detectable for redirect', async () => {
  assert.equal(isWorkspaceAdminPath('/ekodibiz/admin/'), true);
  assert.equal(isWorkspaceAdminPath('/admin/ekodimall/'), true);
  assert.equal(isWorkspaceAdminPath('/admin/ekodimall/channel-settings'), true);
  assert.equal(isWorkspaceAdminPath('/ekodibiz/ekodimall/admin/'), true);
  assert.equal(isWorkspaceAdminPath('/ekodibiz/mall/admin/'), true);
  assert.equal(isWorkspaceAdminPath('/jadam/admin/'), true);
  assert.equal(isWorkspaceAdminPath('/jadam/marketing/admin/channels'), true);
  assert.equal(isWorkspaceAdminPath('/admin/'), false);
  assert.equal(isWorkspaceAdminPath('/'+'org'+'/ekodibiz/ekodimall/admin/'), false);
  const siteWorker = await fs.readFile(new URL('../site-worker.js', import.meta.url), 'utf8');
  assert.match(siteWorker, /isLegacyMallAdminPath\(url\.pathname\).*redirectLegacyMallAdminPath/s);
  const js = await workspaceAdminScript().text();
  assert.ok(!js.includes('/'+'org'+'/'));
  assert.match(js, /const base=service==='mall'\?'\/ekodibiz':`\/\$\{workspace\}`/);
  assert.ok(js.includes("const adminBase=service?'/admin/ekodimall'"));
  assert.ok(js.includes("key==='channels'?'channel-settings':key"));
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

test('canonical Mall admin reaches Workspace Admin before the general Admin surface', async () => {
  const entry=await fs.readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  const tenantRoute=entry.indexOf("/^\\/admin\\/ekodimall(?:\\/|$)/i.test(url.pathname)");
  const canonicalRoute=entry.indexOf('const canonical=await routeCanonicalSurface');
  assert.ok(tenantRoute>=0);
  assert.ok(canonicalRoute>=0);
  assert.ok(tenantRoute<canonicalRoute);
  const page=await (await import('../workspace-admin-page.js')).workspaceAdminPage().text();
  assert.match(page,/EKODI Workspace Admin/);
  assert.match(page,/workspace-admin\.js/);
});

test('entry gateway redirects legacy Mall admin to the root admin canonical path', async () => {
  const response = await platformEntry.fetch(new Request('https://ekodi.kr/mall/admin/publishing?ref=legacy'), {}, {});
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://ekodi.kr/admin/ekodimall/publishing?ref=legacy');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const manifest = JSON.parse(await fs.readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8'));
  const canonical = manifest.worker.requests.find(item => item.url === 'https://ekodi.kr/admin/ekodimall/');
  assert.ok(canonical);
  assert.deepEqual(canonical.statuses, [200]);
  const probe = manifest.worker.requests.find(item => item.url === 'https://ekodi.kr/mall/admin/');
  assert.ok(probe);
  assert.deepEqual(probe.statuses, [308]);
  assert.equal(probe.candidateVerify, false);
  assert.match(probe.candidateVerifyReason || '', /promoted run_worker_first routing table/);
  assert.equal(probe.rollbackVerify, false);
  assert.ok(probe.headerExpect.includes('location: https://ekodi.kr/admin/ekodimall/'));
});
