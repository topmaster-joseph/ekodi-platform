import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [source, css, directoryApi, entryWorker, build] = await Promise.all([
  readFile(new URL('../client-access.js', import.meta.url), 'utf8'),
  readFile(new URL('../client-access.css', import.meta.url), 'utf8'),
  readFile(new URL('../customer-member-directory.js', import.meta.url), 'utf8'),
  readFile(new URL('../customer-entry-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
]);

test('Control Center ships customer access assets only in the admin build', () => {
  assert.match(build, /'client-access\.css'/);
  assert.match(build, /'client-access\.js'/);
  assert.match(build, /'admin-shell\.html'/);
  assert.match(build, /client-access\.js/);
  assert.match(build, /client-access\.css/);
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

test('Clients UI separates all members, site memberships, pending Google auth and roles', () => {
  assert.match(source, /전체 회원/);
  assert.match(source, /사이트별/);
  assert.match(source, /인증 대기/);
  assert.match(source, /권한별/);
  assert.match(source, /모든 사이트/);
  assert.match(source, /모든 권한/);
  assert.match(css, /\.client-tabs/);
  assert.match(css, /\.client-filterbar/);
  assert.match(css, /\.client-role-grid/);
});

test('customer onboarding remains Google preregistration without invite URLs or local secrets', () => {
  assert.match(source, /Google 고객 사전등록/);
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
