import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [source, css, directoryApi, entryWorker, build, loader] = await Promise.all([
  readFile(new URL('../client-access.js', import.meta.url), 'utf8'),
  readFile(new URL('../client-access.css', import.meta.url), 'utf8'),
  readFile(new URL('../customer-member-directory.js', import.meta.url), 'utf8'),
  readFile(new URL('../customer-entry-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../admin-demand-loader.js', import.meta.url), 'utf8'),
]);

test('Admin Shell ships customer access assets only through the demand-loaded admin path', () => {
  assert.match(build, /'client-access\.css'/);
  assert.match(build, /'client-access\.js'/);
  assert.match(loader, /clients:\s*\{[^}]*styles:\['client-access\.css'\][^}]*scripts:\['client-access\.js'\]/);
  assert.doesNotMatch(build, /asset === 'control-center\.html'/);
});

test('customer member hub uses one authenticated directory endpoint instead of N+1 tenant user loads', () => {
  assert.match(source, /\/api\/customers\/directory/);
  assert.match(source, /\/pre-register/);
  assert.match(source, /authorization/);
  assert.match(source, /ekodi-auth-token/);
  assert.doesNotMatch(source, /Promise\.all\(base\.map/);
  assert.doesNotMatch(source, /\/users`/);
  assert.doesNotMatch(source, /\/api\/customer\/(signup|register|login|accept-invite)/);
});

test('Clients UI separates users, scoped sites, pending Google auth and roles', () => {
  assert.match(source, /전체 사용자/);
  assert.match(source, /사이트·공간/);
  assert.match(source, /인증 대기/);
  assert.match(source, /역할·권한/);
  assert.match(source, /모든 사이트/);
  assert.match(source, /모든 권한/);
  assert.match(css, /\.client-tabs/);
  assert.match(css, /\.client-filterbar/);
  assert.match(css, /\.client-role-grid/);
});

test('customer onboarding remains Google preregistration without invite URLs or local secrets', () => {
  assert.match(source, /Google 인증 대기/);
  assert.match(source, /pre_registered/);
  assert.doesNotMatch(source, /invite\.inviteUrl/);
  assert.doesNotMatch(source, /\/invites/);
  assert.doesNotMatch(source, /crypto\.getRandomValues/);
  assert.doesNotMatch(source, /Math\.random/);
});

test('directory API is sourced from tenant-scoped Google access grants so preregistered members are visible before first login', () => {
  assert.match(directoryApi, /customer_access_grants/);
  assert.match(directoryApi, /LEFT JOIN customer_users/);
  assert.match(directoryApi, /JOIN customer_tenants/);
  assert.match(directoryApi, /last_verified_at \? 'active' : 'pre_registered'/);
  assert.match(directoryApi, /uniqueGoogleAccounts/);
  assert.match(directoryApi, /new Set\(allMembers\.map\(member => normalize\(member\.email\)\)/);
  assert.match(directoryApi, /identityProvider: 'google'/);
  assert.match(entryWorker, /handleCustomerMemberDirectory/);
  assert.match(entryWorker, /const directory = await handleCustomerMemberDirectory/);
});

test('API-provided customer values render through textContent, not HTML injection', () => {
  assert.match(source, /node\.textContent = value/);
  assert.doesNotMatch(source, /innerHTML\s*=/);
  assert.doesNotMatch(source, /insertAdjacentHTML/);
});

test('Clients navigation and responsive layout are part of the module', () => {
  assert.match(source, /data-section|dataset\.section/);
  assert.match(source, /'clients'/);
  assert.match(css, /\.client-access-layout/);
  assert.match(css, /@media\(max-width:900px\)/);
});

test('Clients reuses the shared sidebar button and mounts based on panel readiness', () => {
  assert.match(source, /content\.querySelector\('\[data-panel~="clients"\]'\)/);
  assert.match(source, /let navButton = nav\.querySelector\('\[data-section="clients"\]'\)/);
  assert.match(source, /if \(!navButton\) \{/);
  assert.doesNotMatch(source, /document\.querySelector\('\[data-section="clients"\]'\)\) return null/);
});


test('access center never leaves loading, empty, auth and error states ambiguous', () => {
  assert.match(source, /REQUEST_TIMEOUT_MS = 8000/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /function statePanel/);
  assert.match(source, /statePanel\(\s*'loading'/);
  assert.match(source, /사용자·접근 정보를 불러오지 못했습니다/);
  assert.match(source, /다시 확인/);
  assert.match(source, /lastSuccessfulSyncAt/);
  assert.match(css, /\.client-state/);
  assert.match(css, /\.client-syncbar/);
});

test('canonical direct route loads the directory and refresh keeps scope visible', () => {
  assert.ok(source.includes("const directRoute = /^\\/admin\\/people\\/users-access\\/?$/.test(location.pathname)"));
  assert.match(source, /queueMicrotask\(\(\) => loadDirectory\(\)\)/);
  assert.match(source, /사이트 멤버십 권한은 플랫폼 전체 권한으로 자동 확장되지 않습니다/);
  assert.match(source, /member\.canManage !== false/);
});

test('member management uses a three-pane IAM workspace instead of inline table editors', () => {
  assert.match(source, /function renderScopePane/);
  assert.match(source, /function renderMemberList/);
  assert.match(source, /function renderMemberDetail/);
  assert.match(source, /client-iam-workspace/);
  assert.match(source, /selectedMemberKey/);
  assert.match(source, /renderMemberList\(members, selected\)/);
  assert.match(source, /renderMemberDetail\(selected\)/);
  const memberView = source.slice(source.indexOf('function renderMemberView'), source.indexOf('function renderTenantCards'));
  assert.doesNotMatch(memberView, /memberTable\(/);
  assert.doesNotMatch(source, /function memberTable/);
});

test('scope pane filters the center list while preserving pending and role filters', () => {
  assert.match(source, /shell\.site\.value = tenant\.slug/);
  assert.match(source, /shell\.site\.value = ''/);
  assert.match(source, /forcePending \? 'pre_registered' : shell\.status\.value/);
  assert.match(source, /selectedMemberFrom\(members\)/);
  assert.match(source, /memberSelectionKey/);
});

test('selected member detail preserves read-only authority and reviewed mutations', () => {
  assert.match(source, /const manageable = member\.canManage !== false/);
  assert.match(source, /현재 관리자 권한에서는 이 멤버십을 조회만 할 수 있습니다/);
  assert.match(source, /변경 저장/);
  assert.match(source, /confirmAccessChanges\(member, changes\)/);
  assert.match(source, /accessExplanation\(member\)/);
});

test('mobile IAM workspace stacks scope, list and detail without horizontal table dependency', () => {
  assert.match(css, /\.client-iam-workspace\{display:grid/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /\.client-iam-workspace\{display:grid;grid-template-columns:1fr\}/);
  assert.match(css, /\.client-scope-pane\{display:flex/);
  assert.match(css, /\.client-member-detail\{order:3/);
  assert.match(css, /\.client-site-member-workspace\{grid-template-columns:1fr\}/);
  assert.match(css, /\.client-access-summary\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
