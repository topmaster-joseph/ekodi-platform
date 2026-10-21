import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ADMIN_MENU_REGISTRY } from '../admin-menu-registry.js';
import { validateAdminMenuAudience } from '../scripts/validate-admin-menu-audience.mjs';

const policy = JSON.parse(await readFile(new URL('../config/admin-menu-audience-policy.json', import.meta.url), 'utf8'));
const orchestration = JSON.parse(await readFile(new URL('../config/ai-change-orchestration-policy.json', import.meta.url), 'utf8'));
const agentsText = await readFile(new URL('../AGENTS.md', import.meta.url), 'utf8');
const registryIds = ADMIN_MENU_REGISTRY.map(item => item.id);
const base = () => ({ policy: structuredClone(policy), orchestration, registryIds: [...registryIds], superAdminOnlyIds: [], agentsText });

test('every current admin menu has an orchestrator-decided audience', () => {
  assert.deepEqual(validateAdminMenuAudience(base()), []);
});

test('a new admin menu without classification is rejected', () => {
  const input = base();
  input.registryIds.push('new-unclassified-menu');
  const fail = validateAdminMenuAudience(input);
  assert.ok(fail.some(line => line.includes('new-unclassified-menu') && line.includes('no EKODI-orchestrated audience')));
});

test('classification must be decided by the EKODI orchestrator', () => {
  const input = base();
  input.policy.classification.decidedBy = 'claude';
  assert.ok(validateAdminMenuAudience(input).some(line => line.includes('decidedBy')));
});

test('unknown audience and stale entries are rejected', () => {
  const input = base();
  input.policy.classification.entries.health = { audience: 'everyone' };
  input.policy.classification.entries['ghost-menu'] = { audience: 'platform-super-admin' };
  const fail = validateAdminMenuAudience(input);
  assert.ok(fail.some(line => line.includes('unknown audience')));
  assert.ok(fail.some(line => line.includes('ghost-menu') && line.includes('stale')));
});

test('site operations menus must mirror a real site admin menu', () => {
  const input = base();
  input.policy.classification.entries.books = { audience: 'platform-site-operations', siteMenu: 'content.nonexistent' };
  assert.ok(validateAdminMenuAudience(input).some(line => line.includes('must mirror a site admin menu')));
});

test('platform-only menus cannot claim a site mirror, and superAdminOnly cannot become site-admin', () => {
  const input = base();
  input.policy.classification.entries.aiops = { audience: 'platform-super-admin', siteMenu: 'ai.usage' };
  input.policy.classification.entries.admins = { audience: 'site-admin' };
  input.superAdminOnlyIds = ['admins'];
  const fail = validateAdminMenuAudience(input);
  assert.ok(fail.some(line => line.includes('"aiops"') && line.includes('must not declare siteMenu')));
  assert.ok(fail.some(line => line.includes('superAdminOnly menu "admins"')));
});

test('tenant exposure stays behind the human gate and site admins never inherit platform authority', () => {
  const input = base();
  input.policy.audienceChangeGates['toward-tenant-exposure'] = 'orchestrator-autonomous';
  input.policy.audiences['site-admin'].inheritsPlatformAuthority = true;
  const fail = validateAdminMenuAudience(input);
  assert.ok(fail.some(line => line.includes('sovereign human gate')));
  assert.ok(fail.some(line => line.includes('never inherit platform authority')));
});

test('real AI operations center is classified platform-only and content menus mirror site admin', () => {
  const entries = policy.classification.entries;
  assert.equal(entries.aiops.audience, 'platform-super-admin');
  assert.equal(entries.books.siteMenu, 'content.posts');
  assert.equal(entries['site-chrome'].siteMenu, 'settings.chrome');
});
