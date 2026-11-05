import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import siteWorker from '../site-worker.js';
import {handleAgeVerificationRequest, ageVerificationAdminSnapshot} from '../age-verification-core.js';

const host = 'https://ekodi.kr';
const assets = {fetch: async req => new Response('<html>age UI</html>', {headers:{'content-type':'text/html'}})};
const request = (path, method='GET') => new Request(host + path,{method});
const site = (path, method) => siteWorker.fetch(request(path,method), {ASSETS: assets});

test('canonical public hosted page, responsive assets, noindex and provider-only CSP',async()=>{
  const canonical = await site('/verify/adult?site=singles&return_to=%2Fsingles%2Fsubscribe');
  assert.equal(canonical.status,308);
  assert.match(canonical.headers.get('location'), /\/verify\/adult\/\?site=singles/);
  const r = await site('/verify/adult/?site=singles');
  assert.equal(r.status,200);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self' https:\/\/cdn\.portone\.io/);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.doesNotMatch(r.headers.get('content-security-policy'), /unsafe-inline/);
  assert.match(r.headers.get('cache-control'),/no-store/);
  assert.match(r.headers.get('x-robots-tag'), /noindex/);
  for(const file of ['app.js','styles.css','client.js']) {
    const item=await site('/verify/adult/'+file);
    assert.equal(item.status,200,file);
    assert.match(item.headers.get('cache-control'),/no-store/);
  }
  assert.equal((await site('/verify/adult/bogus.js')).status,404);
  assert.equal((await site('/verify/adult/', 'POST')).status,405);
  assert.equal((await site('/verify/adult/bogus', 'OPTIONS')).status,405);
});

test('public home retains strict CSP without third-party age verification SDK', async()=>{
  const r=await site('/promotion.js');
  assert.equal(r.status,200);
  assert.doesNotMatch(r.headers.get('content-security-policy'),/portone\.io/);
});

test('configured provider publishes only public auth metadata with existing MY Supabase env fallback', async()=>{
  const env={
    DB:{},
    AGE_VERIFICATION_ENABLED:'true',
    AGE_VERIFICATION_SITE_POLICIES:'{"singles":"civil_adult_19"}',
    PORTONE_AGE_STORE_ID:'store-abc12345',
    PORTONE_AGE_CHANNEL_KEY:'channel-key-abc12345',
    PORTONE_AGE_API_SECRET:'super-secret',
    MY_SUPABASE_URL:'https://example.supabase.co',
    MY_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_demo'
  };
  const response=await handleAgeVerificationRequest(request('/api/age-verification/config?site=singles'),env);
  assert.equal(response.status,200);
  const raw=await response.text(),data=JSON.parse(raw);
  assert.equal(data.enabled,true);
  assert.equal(data.auth.supabaseUrl,env.MY_SUPABASE_URL);
  assert.equal(data.auth.publishableKey,env.MY_SUPABASE_PUBLISHABLE_KEY);
  assert.ok(!raw.includes('super-secret'));
  assert.equal((await (await handleAgeVerificationRequest(request('/api/age-verification/config?site=other'),env)).json()).enabled,false);
  assert.equal((await (await handleAgeVerificationRequest(request('/api/age-verification/config?site=singles'),{...env,AGE_VERIFICATION_ENABLED:'false'})).json()).enabled,false);
});

test('hosted page uses server-confirmed results, same-origin relative return, mobile redirect and login',async()=>{
  const html=await readFile(new URL('../verify/adult/index.html',import.meta.url),'utf8');
  const js=await readFile(new URL('../verify/adult/app.js',import.meta.url),'utf8');
  const client=await readFile(new URL('../age-verification-client.js',import.meta.url),'utf8');
  assert.match(html, /role="status"/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(js,/history\.replaceState/);
  assert.match(js,/redirectUrl: canonicalRedirectUrl/);
  assert.match(js,/return_to=/);
  assert.match(js,/new URL\(raw, location\.origin\)/);
  assert.match(js,/url\.origin !== location\.origin/);
  assert.match(js,/ekodiAdultStatus/);
  assert.match(client,/identityVerificationId/);
  assert.match(client,/code !== undefined/);
  for(const content of [html,js])assert.doesNotMatch(content,/PORTONE_AGE_API_SECRET|SUPABASE_SERVICE_ROLE_KEY/);
});

test('platform admin readiness view is aggregated and excludes personal and provider secrets', async()=>{
  const env={
    AGE_VERIFICATION_ENABLED:'false',
    AGE_VERIFICATION_SITE_POLICIES:'{"singles":"civil_adult_19","ekodimall":"youth_protection_19","invalid":true}',
    PORTONE_AGE_API_SECRET:'redacted-provider-secret',
    DB:{prepare(sql){return {bind(){return this;},async first(){
      if(sql.includes('sqlite_master'))return {name:'age_verification_attempts'};
      if(sql.includes('age_verification_grants'))return {total:2};
      if(sql.includes('age_verification_attempts'))return {total:7};
      throw new Error(sql);
    }};}}
  };
  const view=await ageVerificationAdminSnapshot(env);
  assert.equal(view.enabled,false);
  assert.equal(view.schemaReady,true);
  assert.equal(view.activeGrants,2);
  assert.equal(view.attempts24h,7);
  assert.equal(view.sitePolicies.singles,'civil_adult_19');
  assert.ok(!('invalid' in view.sitePolicies));
  assert.doesNotMatch(JSON.stringify(view),/redacted-provider-secret|subject_id|birthDate/);
  const source=await readFile(new URL('../api-worker.js',import.meta.url),'utf8');
  assert.ok(source.indexOf('if (!auth.session) return auth.response;') < source.indexOf('if (request.method === \'GET\' && path === `${CONTROL_PREFIX}/age-verification`)'));
});
