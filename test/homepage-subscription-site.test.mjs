import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isHomepageSubscriptionSlug, fetchHomepageSite, renderHomepageSiteHtml, renderHomepageSubscriptionSite, homepageSiteJsonLd,
} from '../homepage-subscription-site.js';
import { FEATURE_STATUS, featureStatus, HOMEPAGE_PRICING, HOMEPAGE_TYPES, ekodiBizHomepageServiceHtml, ekodiBizHomepageServiceResponse } from '../ekodibiz-homepage-service-page.js';
import { isPublicWorkspacePath, workspaceSlugFromPublicPath } from '../workspace-route-policy.js';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'pk' };
const published = { slug: 'hp-abcd1234', published: true, audience: 'business', plan: 'S2', display_name: '테스트상회', headline: '테스트상회', intro: '동네 가게', phone: '010-1234-5678', address: '전남 무안군 청계면', hours: '매일 10:00~20:00', links: [{ label: '인스타그램', url: 'https://instagram.com/x' }, { label: 'bad', url: 'javascript:alert(1)' }] };

test('subscription site slugs are hp-xxxxxxxx and route to the public workspace gateway', () => {
  assert.equal(isHomepageSubscriptionSlug('hp-abcd1234'), true);
  for (const bad of ['hp-abc', 'hp-ABCD1234x', 'bbqcg', 'hp-abcd123_', '']) assert.equal(isHomepageSubscriptionSlug(bad), false, bad);
  assert.equal(isPublicWorkspacePath('/hp-abcd1234'), true);
  assert.equal(workspaceSlugFromPublicPath('/hp-abcd1234'), 'hp-abcd1234');
});

test('draft (not yet published) sites expose no name or contact and are noindex', () => {
  const { status, html } = renderHomepageSiteHtml({ slug: 'hp-abcd1234', published: false }, 'hp-abcd1234');
  assert.equal(status, 200);
  assert.match(html, /noindex,nofollow/);
  assert.ok(html.includes('홈페이지를 준비하고 있습니다'));
  assert.ok(!html.includes('ld+json'));
  const missing = renderHomepageSiteHtml(null, 'hp-zzzz0000');
  assert.equal(missing.status, 404);
});

test('published site is a generic one-page site with contact, safe links and structured data', () => {
  const { status, html } = renderHomepageSiteHtml(published, 'hp-abcd1234');
  assert.equal(status, 200);
  assert.match(html, /index,follow/);
  assert.ok(html.includes('<link rel="canonical" href="https://ekodi.kr/hp-abcd1234">'));
  for (const s of ['테스트상회', 'tel:01012345678', '전남 무안군 청계면', '매일 10:00~20:00', 'https://instagram.com/x', '에코디비즈 홈페이지 구독']) assert.ok(html.includes(s), s);
  assert.ok(!html.includes('javascript:'), 'unsafe link dropped');
  assert.ok(!/목포대/.test(html), 'no restaurant-specific copy');
  const ld = JSON.parse(html.split('<script type="application/ld+json">')[1].split('</script>')[0]);
  assert.equal(ld['@type'], 'LocalBusiness');
  assert.equal(ld.telephone, '010-1234-5678');
  assert.equal(JSON.parse(homepageSiteJsonLd({ ...published, audience: 'personal' }, 'u'))['@type'], 'Person');
  assert.equal(JSON.parse(homepageSiteJsonLd({ ...published, audience: 'event' }, 'u'))['@type'], 'Event');
  const esc = renderHomepageSiteHtml({ ...published, display_name: '<script>x</script>', headline: '<b>x</b>' }, 'hp-abcd1234').html;
  assert.ok(!esc.includes('<script>x</script>') && !esc.includes('<b>x</b>'));
});

test('renderer fetches the public RPC and sets its own CSP and route header', async () => {
  let called = null;
  const res = await renderHomepageSubscriptionSite(new Request('https://ekodi.kr/hp-abcd1234'), env, 'hp-abcd1234', async (url, init) => { called = { url, body: init.body }; return new Response(JSON.stringify(published)); });
  assert.equal(called.url, 'https://x.supabase.co/rest/v1/rpc/homepage_site_public');
  assert.deepEqual(JSON.parse(called.body), { p_slug: 'hp-abcd1234' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-ekodi-route'), 'space-homepage-subscription');
  assert.match(res.headers.get('content-security-policy'), /style-src 'unsafe-inline'/);
  assert.equal(await fetchHomepageSite('bbqcg', env, async () => { throw new Error('must not fetch'); }), null);
});

test('space worker dispatches hp- slugs before storefront/workspace renderers', async () => {
  const src = await read('space-worker.js');
  assert.match(src, /from '\.\/homepage-subscription-site\.js'/);
  const i = src.indexOf('isHomepageSubscriptionSlug(requested)');
  assert.ok(i > 0 && i < src.indexOf('isOrganizationWorkspaceSlug(requested)&&!workspaceRoute?.service'));
});

test('migration provisions drafts automatically and keeps publishing behind platform admin', async () => {
  const sql = await read('supabase/migrations/20261121160000_homepage_subscription_auto_provision.sql');
  assert.match(sql, /create table if not exists public\.homepage_subscription_requests/);
  assert.match(sql, /create table if not exists public\.homepage_sites/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /grant execute on function public\.homepage_subscription_submit\(jsonb\) to anon, authenticated/);
  assert.match(sql, /if not public\.homepage_subscription_is_admin\(\) then return jsonb_build_object\('ok',false,'error','forbidden'\)/);
  assert.match(sql, /to_regprocedure\('public\.is_platform_admin\(\)'\) is not null then\n    execute 'select public\.is_platform_admin\(\)'/);
  assert.match(sql, /interval '1 day'\) >= 3/);
  assert.doesNotMatch(sql, /alter table public\.(stores|tenants|store_user_sites)|drop (table|function)|delete from/i);
  const wf = await read('.github/workflows/deploy-space.yml');
  assert.ok(wf.includes('HOMEPAGE_SUB_MIGRATION: supabase/migrations/20261121160000_homepage_subscription_auto_provision.sql'));
  assert.ok(wf.includes(`apply_dev_migration "$HOMEPAGE_SUB_MIGRATION"`));
  assert.ok(wf.includes(`'"homepage_sub":true'`));
});

test('subscription page labels every advertised feature with its real status', () => {
  const html = ekodiBizHomepageServiceHtml();
  for (const p of Object.values(HOMEPAGE_PRICING.plans)) for (const f of p.scope.split(/,\s*/)) assert.ok(['auto', 'setup', 'planned'].includes(featureStatus(f)));
  assert.equal(featureStatus('S3 + 온라인 주문·결제'), 'planned');
  assert.equal(featureStatus('리뷰 모음'), 'planned');
  assert.equal(featureStatus('S2 + 예약/견적 신청·휴대폰 알림'), 'setup');
  assert.equal(featureStatus('모바일 최적화'), 'auto');
  for (const v of Object.values(FEATURE_STATUS)) assert.ok(html.includes(v.label) && html.includes(v.note));
  for (const t of HOMEPAGE_TYPES) for (const f of t.features) assert.ok(html.includes(`</span> ${f}`) || html.includes(f));
  assert.ok(html.includes('/rest/v1/rpc/homepage_subscription_submit'));
  assert.ok(html.includes('준비 중인 기능은 제공 전까지 해당 금액을 청구하지 않습니다'));
  assert.ok(html.includes('첫 결제 확인 후 공개됩니다'));
});

test('subscription page CSP allows only the Supabase project origin besides self', () => {
  const csp = ekodiBizHomepageServiceResponse().headers.get('content-security-policy');
  assert.match(csp, /connect-src 'self' https:\/\/renzehysxirjilvdxacv\.supabase\.co;/);
});
