import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { authorizeEkodiAction } from '../ekodi-authorization.js';
import { accessScopeDirectory, normalizeAccessScope, serviceScopeForAdminPath } from '../access-scope-registry.js';
import { universalGrantAuthority, validateUniversalGrant } from '../universal-access-policy.js';

const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

function grant(overrides = {}) {
  return {
    id: 'grant:test',
    email: 'developer@example.com',
    principal_type: 'member',
    github_username: '',
    scope_type: 'service',
    scope_key: 'church',
    role: 'viewer',
    capabilities_json: '[]',
    denied_capabilities_json: '[]',
    enabled: 1,
    expires_at: null,
    ...overrides,
  };
}

test('scope registry covers platform and canonical service/site admins without URL authority', () => {
  const scopes = accessScopeDirectory();
  const ids = new Set(scopes.map(item => item.id));
  assert.ok(ids.has('platform:ekodi'));
  for (const id of ['church','biz','mall','cgma','cmpmyi','jadam','pizzamaru','yogurt']) assert.ok(ids.has(`service:${id}`), id);
  assert.equal(ids.size, scopes.length);
  assert.deepEqual(serviceScopeForAdminPath('/ekodichurch/admin'), { type:'service', key:'church' });
  assert.deepEqual(serviceScopeForAdminPath('/cgma/admin'), { type:'service', key:'cgma' });
  assert.equal(serviceScopeForAdminPath('/ekodichurch/admin/other'), null);
});

test('service admin can review only the exact service scope', () => {
  const authority = universalGrantAuthority(grant({ role:'service_admin' }));
  assert.ok(authority);
  assert.equal(authorizeEkodiAction({ authority, requiredCapabilities:['service:access.review'], resourceScope:{ type:'service', id:'church' } }).allowed, true);
  const sibling = authorizeEkodiAction({ authority, requiredCapabilities:['service:access.review'], resourceScope:{ type:'service', id:'biz' } });
  assert.equal(sibling.allowed, false);
  assert.equal(sibling.code, 'SCOPE_FORBIDDEN');
});

test('workspace admin cannot cross workspace boundaries', () => {
  const authority = universalGrantAuthority(grant({ role:'workspace_admin', scope_type:'workspace', scope_key:'workspace-A' }));
  assert.equal(authorizeEkodiAction({ authority, requiredCapabilities:['workspace:access.review'], resourceScope:{ type:'workspace', id:'workspace-A' } }).allowed, true);
  assert.equal(authorizeEkodiAction({ authority, requiredCapabilities:['workspace:access.review'], resourceScope:{ type:'workspace', id:'workspace-B' } }).code, 'SCOPE_FORBIDDEN');
});

test('platform admin is explicit platform scope and sensitive writes still need elevation', () => {
  const authority = universalGrantAuthority(grant({ role:'platform_admin', scope_type:'platform', scope_key:'ekodi' }));
  assert.equal(authorizeEkodiAction({ authority, requiredCapabilities:['service:read'], resourceScope:{ type:'service', id:'church' } }).allowed, true);
  const write = authorizeEkodiAction({ authority, requiredCapabilities:['admin:accounts.write'], resourceScope:{ type:'platform', id:'global' } });
  assert.equal(write.allowed, false);
  assert.equal(write.code, 'ELEVATION_REQUIRED');
});

test('external developer remains bounded and deny-first', () => {
  const authority = universalGrantAuthority(grant({
    role:'external_developer', principal_type:'external_collaborator', github_username:'sample-dev', expires_at:future,
    capabilities_json: JSON.stringify(['deploy:production','service:access.review']),
  }));
  assert.equal(authorizeEkodiAction({ authority, requiredCapabilities:['service:source.read'], resourceScope:{ type:'service', id:'church' } }).allowed, true);
  assert.equal(authorizeEkodiAction({ authority, requiredCapabilities:['deploy:production'], resourceScope:{ type:'service', id:'church' } }).allowed, false);
  assert.equal(authorizeEkodiAction({ authority, requiredCapabilities:['service:access.review'], resourceScope:{ type:'service', id:'church' } }).allowed, false);
});

test('external developer requires GitHub identity and bounded expiry', () => {
  const missing = validateUniversalGrant({ email:'developer@example.com', role:'external_developer', scopeType:'service', scopeKey:'church' });
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.includes('GITHUB_USERNAME_REQUIRED'));
  assert.ok(missing.errors.includes('EXPIRY_REQUIRED'));
  const valid = validateUniversalGrant({ email:'developer@example.com', role:'external_developer', scopeType:'service', scopeKey:'church', githubUsername:'sample-dev', expiresAt:future });
  assert.equal(valid.ok, true);
});

test('role and scope mismatch fails closed', () => {
  assert.equal(validateUniversalGrant({ email:'a@example.com', role:'platform_admin', scopeType:'service', scopeKey:'church' }).errors.includes('ROLE_SCOPE_MISMATCH'), true);
  assert.equal(normalizeAccessScope({ type:'service', key:'unknown-service' }), null);
});

test('0091 migration is additive and backfills customer grants into workspace scope', () => {
  const sql = fs.readFileSync(new URL('../migrations/0091_universal_access_grants.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS access_scope_grants/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS access_scope_grant_audit/);
  assert.match(sql, /FROM customer_access_grants a/);
  assert.match(sql, /'workspace'/);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM customer_access_grants/i);
});
