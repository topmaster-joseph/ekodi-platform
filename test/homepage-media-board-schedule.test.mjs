import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderHomepageSiteHtml, homepageMediaUrl } from '../homepage-subscription-site.js';
import { ekodiBizHomepageServiceHtml, HOMEPAGE_PRICING, featureStatus } from '../ekodibiz-homepage-service-page.js';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const BASE = 'https://x.supabase.co/storage/v1/object/public/homepage-media/';

test('migration enforces per-plan limits, owner/admin rights and slug-scoped storage', async () => {
  const sql = await read('supabase/migrations/20261122190000_homepage_media_board_schedule.sql');
  assert.match(sql, /when 'S1' then '\{"hero":true,"gallery":6,"board":false,"schedule":false\}'/);
  assert.match(sql, /when 'S2' then '\{"hero":true,"gallery":20,"board":true,"schedule":true\}'/);
  assert.match(sql, /when 'S4' then '\{"hero":true,"gallery":100,"board":true,"schedule":true\}'/);
  for (const fn of ['homepage_media_add', 'homepage_media_delete', 'homepage_post_save', 'homepage_post_delete', 'homepage_event_save', 'homepage_event_delete', 'homepage_site_manage'])
    assert.match(sql, new RegExp(`function public\\.${fn}\\([^)]*\\)[\\s\\S]*?if not public\\.homepage_can_manage\\(v_slug\\) then return jsonb_build_object\\('ok',false,'error','forbidden'\\)`), fn);
  assert.match(sql, /p_path,''\) !~ \('\^' \|\| v_slug \|\| '\/\[A-Za-z0-9\._-\]\{1,120\}\$'\)/);
  assert.match(sql, /with check \(bucket_id = 'homepage-media' and public\.homepage_can_manage\(\(storage\.foldername\(name\)\)\[1\]\)\)/);
  assert.match(sql, /file_size_limit[\s\S]*5242880[\s\S]*'image\/jpeg','image\/png','image\/webp'/);
  for (const t of ['homepage_site_media', 'homepage_site_posts', 'homepage_site_events']) assert.match(sql, new RegExp(`revoke all on table public\\.${t} from public, anon, authenticated, service_role;`));
  assert.doesNotMatch(sql, /grant execute on function public\.homepage_(media|post|event)_[a-z]+\([^)]*\) to anon/);
  const wf = await read('.github/workflows/deploy-space.yml');
  assert.ok(wf.includes('apply_migration "supabase/migrations/20261122190000_homepage_media_board_schedule.sql"'));
});

test('public site shows hero, gallery, upcoming events and posts safely', () => {
  const site = { slug: 'hp-abcd1234', published: true, audience: 'community', plan: 'S2', display_name: '단체', hero: 'hp-abcd1234/h.jpg',
    gallery: [{ path: 'hp-abcd1234/g1.jpg', caption: '<모임>' }, { path: '../etc/passwd' }, { path: 'hp-zzzz9999/x.jpg?a=1' }],
    posts: [{ title: '<b>소식</b>', body: '줄1\n줄2', created_at: '2026-11-22T00:00:00Z' }], events: [{ title: '바자회', event_date: '2030-05-01', event_time: '10:00', place: '청계면' }] };
  const { html } = renderHomepageSiteHtml(site, 'hp-abcd1234', BASE);
  assert.ok(html.includes(`class="hero" src="${BASE}hp-abcd1234/h.jpg"`));
  assert.equal((html.match(/<figure>/g) || []).length, 1, 'invalid media paths dropped');
  assert.ok(html.includes('alt="&lt;모임&gt;"') && html.includes('&lt;b&gt;소식&lt;/b&gt;') && html.includes('줄1<br>줄2'));
  assert.ok(html.includes('5월 1일 10:00') && html.includes('· 청계면'));
  assert.equal(homepageMediaUrl(BASE, 'hp-abcd1234/a b.jpg'), '');
  assert.equal(homepageMediaUrl('', 'hp-abcd1234/a.jpg'), '');
  const bare = renderHomepageSiteHtml({ ...site, hero: null, gallery: [], posts: [], events: [] }, 'hp-abcd1234', BASE).html;
  assert.ok(!bare.includes('id="gallery"') && !bare.includes('id="posts"') && !bare.includes('id="events"'));
});

test('mine tab manages photos, board and schedule via owner RPCs and slug-scoped uploads', () => {
  const html = ekodiBizHomepageServiceHtml();
  for (const n of ["hpRpc('homepage_site_manage'", "hpRpc('homepage_media_add'", "hpRpc('homepage_media_delete'", "hpRpc('homepage_post_save'", "hpRpc('homepage_event_save'",
    "SB+'/storage/v1/object/homepage-media/'+name", "var name=m.slug+'/'", "c.toBlob(res,'image/jpeg',0.85)", 'data-up="hero"', 'data-up="gallery"', "await storageCall('DELETE',name);throw err;", 'S2 이상 요금제에서 사용할 수 있습니다.'])
    assert.ok(html.includes(n), n);
  assert.ok(HOMEPAGE_PRICING.plans.S1.scope.includes('대표 이미지·사진 6장 직접 올리기'));
  assert.ok(HOMEPAGE_PRICING.plans.S2.scope.includes('사진 20장·게시판(소식)·일정표 직접 올리기'));
  assert.equal(featureStatus('사진 20장·게시판(소식)·일정표 직접 올리기'), 'auto');
  assert.equal(featureStatus('S3 + 사진 50장'), 'auto');
});
