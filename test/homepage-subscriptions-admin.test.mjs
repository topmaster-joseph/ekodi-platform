import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { summarizeHomepageRequests, HOMEPAGE_SUBSCRIPTIONS_ADMIN_SECTION, STATUS_LABELS } from '../homepage-subscriptions-admin.js';
import { getAdminMenuItem, getAdminMenuForSection } from '../admin-menu-registry.js';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('summary counts consult, waiting and published requests', () => {
  assert.deepEqual(summarizeHomepageRequests([
    { mode: 'consult' }, { mode: 'subscribe', site_slug: 'hp-aaaaaaaa', published: false },
    { mode: 'subscribe', site_slug: 'hp-bbbbbbbb', published: true },
  ]), { total: 3, consult: 1, waiting: 1, published: 1 });
  assert.deepEqual(summarizeHomepageRequests(null), { total: 0, consult: 0, waiting: 0, published: 0 });
  assert.equal(STATUS_LABELS.provisioned, '개설됨·비공개');
});

test('panel is a super-admin-only services menu', () => {
  assert.equal(HOMEPAGE_SUBSCRIPTIONS_ADMIN_SECTION, 'homepage-subscriptions');
  const item = getAdminMenuItem('homepage-subscriptions');
  assert.equal(item.group, 'services');
  assert.equal(item.superAdminOnly, true);
  assert.equal(getAdminMenuForSection('homepage-subscriptions')?.id, 'homepage-subscriptions');
});

test('panel uses DB-enforced admin RPCs, confirms before publishing and escapes customer data', async () => {
  const src = await read('homepage-subscriptions-admin.js');
  assert.match(src, /rpc\('homepage_subscription_admin_list'/);
  assert.match(src, /rpc\('homepage_subscription_publish', \{ p_slug: slug, p_published: value \}\)/);
  assert.match(src, /if \(session\?\.role !== 'super_admin'\) return deny\(\);/);
  assert.match(src, /window\.confirm\(/);
  assert.match(src, /\$\{esc\(r\.display_name\)\}/);
  assert.match(src, /grant_type=refresh_token/);
  assert.ok(!/service_role|SERVICE_ROLE/.test(src));
  const build = await read('scripts/build.mjs');
  assert.ok(build.includes("'homepage-subscriptions-admin.js'"));
  const headers = await read('_headers');
  assert.match(headers, /\/admin\/\*[\s\S]*?connect-src 'self' https:\/\/renzehysxirjilvdxacv\.supabase\.co/);
});
