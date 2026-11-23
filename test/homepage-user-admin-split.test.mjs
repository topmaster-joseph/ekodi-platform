import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {
  ekodiBizHomepageRoute, isEkodiBizHomepageAdminPath,
  ekodiBizHomepageServiceHtml, ekodiBizHomepageAdminHtml, EKODIBIZ_HOMEPAGE_SERVICE_URL,
} from '../ekodibiz-homepage-service-page.js';
import { RESERVED_WORKSPACE_SLUGS, isPublicWorkspacePath } from '../workspace-route-policy.js';

const req = (path, method = 'GET') => [new Request(`https://ekodi.kr${path}`, { method }), new URL(`https://ekodi.kr${path}`)];
const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('user page lives at /homepage, admin at /homepage/admin, legacy /ekodibiz/homepage paths fully retired', async () => {
  assert.equal(EKODIBIZ_HOMEPAGE_SERVICE_URL, 'https://ekodi.kr/homepage');
  const user = ekodiBizHomepageRoute(...req('/homepage'));
  assert.equal(user.status, 200); assert.equal(user.headers.get('x-ekodi-route'), 'ekodibiz-homepage-service');
  const admin = ekodiBizHomepageRoute(...req('/homepage/admin'));
  assert.equal(admin.status, 200); assert.equal(admin.headers.get('x-ekodi-route'), 'ekodibiz-homepage-admin');
  assert.match(admin.headers.get('x-robots-tag'), /noindex/); assert.equal(admin.headers.get('cache-control'), 'no-store');
  for (const p of ['/ekodibiz/homepage', '/ekodibiz/homepage-service', '/ekodibiz/web-subscription/']) assert.equal(ekodiBizHomepageRoute(...req(p)), null, `${p} fully retired, no redirect`);
  assert.equal(ekodiBizHomepageRoute(...req('/homepage', 'POST')), null);
  assert.equal(ekodiBizHomepageRoute(...req('/homepage/x')), null);
  assert.equal(ekodiBizHomepageRoute(...req('/homepage', 'HEAD')).body, null);
  assert.equal(isEkodiBizHomepageAdminPath('/homepage/admin/'), true);
});

test('"homepage" is a reserved platform service name, not a workspace slug', () => {
  assert.equal(RESERVED_WORKSPACE_SLUGS.has('homepage'), true);
  assert.equal(isPublicWorkspacePath('/homepage'), false);
});

test('user page manages own requests by login permission and shows admin tools only to admins', () => {
  const html = ekodiBizHomepageServiceHtml();
  assert.match(html, /id="ptab-mine" aria-controls="minePanel"/);
  assert.match(html, /id="minePanel" class="page-panel" role="tabpanel"[^>]* hidden>/);
  for (const n of ["hpRpc('homepage_my_requests'", "hpRpc('homepage_site_owner_update'", "if(d.is_admin)", "hpRpc('homepage_subscription_admin_list'", "hpLogin('https://ekodi.kr/homepage#mine')", 'href="/homepage/admin"']) assert.ok(html.includes(n), n);
  for (const js of html.split('<script>').slice(1).map((x) => x.split('</script>')[0])) assert.doesNotThrow(() => new vm.Script(js));
  assert.ok(!/service_role/i.test(html));
});

test('admin page only lists all requests and toggles publishing; access decided by DB', () => {
  const html = ekodiBizHomepageAdminHtml();
  for (const n of ["hpRpc('homepage_subscription_admin_list'", "hpRpc('homepage_subscription_publish'", "e.code==='forbidden'", "hpLogin('https://ekodi.kr/homepage/admin')", 'window.confirm(', 'noindex,nofollow']) assert.ok(html.includes(n), n);
  assert.ok(!html.includes('homepage_site_owner_update'));
  for (const js of html.split('<script>').slice(1).map((x) => x.split('</script>')[0])) assert.doesNotThrow(() => new vm.Script(js));
});

test('owner self-service migration checks login email ownership or platform admin', async () => {
  const sql = await read('supabase/migrations/20261122140000_homepage_owner_self_service.sql');
  assert.match(sql, /lower\(coalesce\(auth\.jwt\(\)->>'email',''\)\)/);
  assert.match(sql, /if v_owner <> v_email and not public\.homepage_subscription_is_admin\(\) then return jsonb_build_object\('ok',false,'error','forbidden'\)/);
  assert.match(sql, /'\^https:\/\/\[\^\\s<>"\]\+\$'/);
  assert.match(sql, /grant execute on function public\.homepage_site_owner_update\(text, jsonb\) to authenticated;/);
  assert.doesNotMatch(sql, /to anon/);
  const wf = await read('.github/workflows/deploy-space.yml');
  assert.ok(wf.includes('20261122140000_homepage_owner_self_service.sql'));
});
