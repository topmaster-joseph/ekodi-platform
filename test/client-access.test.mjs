import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [source, css, directoryApi, entryWorker, build, loader, universalApi] = await Promise.all([
  readFile(new URL('../client-access.js', import.meta.url), 'utf8'),
  readFile(new URL('../client-access.css', import.meta.url), 'utf8'),
  readFile(new URL('../customer-member-directory.js', import.meta.url), 'utf8'),
  readFile(new URL('../customer-entry-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../admin-demand-loader.js', import.meta.url), 'utf8'),
  readFile(new URL('../universal-access-control.js', import.meta.url), 'utf8'),
]);

test('Admin Shell ships access assets only through the demand-loaded admin path', () => {
  assert.match(build, /'client-access\.css'/);
  assert.match(build, /'client-access\.js'/);
  assert.match(loader, /clients:\s*\{[^}]*styles:\['client-access\.css'\][^}]*scripts:\['client-access\.js'\]/);
  assert.doesNotMatch(build, /asset === 'control-center\.html'/);
});

test('central access UI uses universal scoped access endpoints', () => {
  assert.match(source, /\/api\/access-governance\/scopes/);
  assert.match(source, /\/api\/access-governance\/grants/);
  assert.match(source, /\/api\/access-governance\/revoke/);
  assert.match(source, /authorization/);
  assert.match(source, /ekodi-auth-token/);
  assert.doesNotMatch(source, /\/api\/customer\/(signup|register|login|accept-invite)/);
});

test('access UI exposes platform, service and workspace scope management', () => {
  assert.match(source, /EKODI 전체 권한/);
  assert.match(source, /platform_admin/);
  assert.match(source, /service_admin/);
  assert.match(source, /workspace_admin/);
  assert.match(source, /ai_manager/);
  assert.match(source, /external_developer/);
  assert.match(source, /운영공간의 고정 workspace_id/);
  assert.match(css, /\.client-access-layout/);
});

test('external developer UI requires GitHub identity and expiry while explaining hard denies', () => {
  assert.match(source, /GitHub 사용자명/);
  assert.match(source, /접근 만료일/);
  assert.match(source, /개인정보·재정·비밀키·운영배포·권한관리/);
  assert.doesNotMatch(source, /invite\.inviteUrl/);
  assert.doesNotMatch(source, /\/invites/);
  assert.doesNotMatch(source, /Math\.random/);
});

test('legacy customer directory stays available during additive universal-access migration', () => {
  assert.match(directoryApi, /customer_access_grants/);
  assert.match(directoryApi, /LEFT JOIN customer_users/);
  assert.match(directoryApi, /JOIN customer_tenants/);
  assert.match(directoryApi, /uniqueGoogleAccounts/);
  assert.match(entryWorker, /handleCustomerMemberDirectory/);
  assert.match(entryWorker, /handleUniversalAccessControl/);
  assert.match(universalApi, /access_scope_grants/);
});

test('API-provided access values render through textContent, not HTML injection', () => {
  assert.match(source, /node\.textContent = value/);
  assert.doesNotMatch(source, /innerHTML\s*=/);
  assert.doesNotMatch(source, /insertAdjacentHTML/);
});

test('Access navigation reuses the shared Clients demand-load slot without creating a second admin route', () => {
  assert.match(source, /data-section|dataset\.section/);
  assert.match(source, /'clients'/);
  assert.match(source, /textContent = '권한'/);
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(source, /content\.querySelector\('\[data-panel~="clients"\]'\)/);
  assert.match(source, /let navButton = nav\.querySelector\('\[data-section="clients"\]'\)/);
});
