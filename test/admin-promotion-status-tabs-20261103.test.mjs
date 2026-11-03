import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { adminMenuTabs, getAdminMenuForSection, getAdminMenuItem, getAdminMenuGroupForSection } from '../admin-menu-registry.js';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('검색노출·홍보 현황 is one AI menu whose four tabs open directly', () => {
  const menu = getAdminMenuForSection('search-visibility');
  assert.equal(menu.labels.ko, '검색노출·홍보 현황');
  assert.equal(menu.group, 'ai');
  assert.deepEqual(adminMenuTabs('promotion-autopost'), ['search-visibility', 'promotion-autopost', 'promotion-channels', 'growth-os']);
  for (const id of adminMenuTabs('search-visibility')) {
    assert.equal(getAdminMenuGroupForSection(id), 'ai', id);
    assert.ok(!getAdminMenuItem(id).internal, id);
  }
  assert.equal(getAdminMenuItem('promotion-autopost').delegateSection, 'marketing-ai');
  assert.equal(getAdminMenuItem('promotion-channels').delegateSection, 'social-accounts');
  // The channel registry stays reachable from 계정·보안 as before.
  assert.equal(getAdminMenuForSection('social-accounts').group, 'accounts');
});

test('promotion tabs have canonical /admin/ai addresses and ship in the admin build', async () => {
  const [routes, build, perf, converge, audience] = await Promise.all(['admin-canonical-routes.js', 'scripts/build.mjs', 'scripts/admin-performance-postbuild.mjs', 'scripts/converge-orchestrated-pr-merge.mjs', 'config/admin-menu-audience-policy.json'].map(read));
  assert.ok(routes.includes("'promotion-autopost':'ai','promotion-channels':'ai'"));
  for (const source of [build, perf, converge]) assert.ok(source.includes('promotion-status-admin.js'));
  const policy = JSON.parse(audience);
  assert.ok(JSON.stringify(policy).includes('"promotion-autopost":{"audience":"platform-super-admin"}'));
});

test('promotion status module aliases existing panels and offers prompts for 에코디와 대화하기 without auto-sending', async () => {
  const source = await read('promotion-status-admin.js');
  for (const marker of ["panel: '#marketingAiAdminPanel', section: 'promotion-autopost'", "panel: '#ekodiSocialAccountRegistry', section: 'promotion-channels'", '[data-marketing-tab="channels"]', '[data-social-refresh]', 'ekodiAssistCommand', '「에코디와 대화하기」', '대화창에 넣기', '복사']) assert.ok(source.includes(marker), marker);
  assert.ok(!source.includes('.submit('), 'prompts must not be submitted automatically');
  assert.ok(!/innerHTML\s*=\s*`[^`]*\$\{text\}/.test(source), 'prompt text is escaped');
});
