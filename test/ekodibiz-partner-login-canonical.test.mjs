import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const businessSlugs = ['software','solar','mall','consulting','trade','publishing','ai-ops','marketing'];
const business = Object.fromEntries(businessSlugs.map(slug => [slug, {
  login: slug === 'mall' || slug === 'trade' ? slug : undefined
}]));

async function partnerLinks() {
  const source = await read('ekodibiz/site.js');
  const start = source.indexOf('function commonLogin(slug)');
  const end = source.indexOf('function persistLocale()', start);
  assert.ok(start > -1 && end > start, 'partner link helpers should be present');
  return runInNewContext(source.slice(start, end) + '\npartnerHref', {
    URL, URLSearchParams, BUSINESS: business
  });
}

test('all eight EKODIBIZ partner links use canonical apex auth and scoped return destinations', async () => {
  const getHref = await partnerLinks();
  for (const slug of businessSlugs) {
    const url = new URL(getHref(slug));
    assert.equal(url.origin, 'https://ekodi.kr', slug);
    assert.equal(url.pathname, '/auth/', slug);
    const expectedSite = slug === 'trade' ? 'trade' : slug === 'mall' ? 'mall' : 'biz';
    assert.equal(url.searchParams.get('site'), expectedSite, slug);
    const destination = new URL(url.searchParams.get('return_to'));
    assert.equal(destination.origin, 'https://ekodi.kr', slug);
    assert.equal(destination.hash, '', slug);
    if (slug === 'trade') {
      assert.equal(destination.pathname, '/ekodibiz/trade');
    } else if (slug === 'mall') {
      assert.equal(destination.pathname, '/ekodimall/admin/');
    } else {
      assert.equal(destination.pathname, '/ekodibiz/');
      assert.equal(destination.searchParams.get('business'), slug);
    }
  }
});

test('partner return keeps business-area selection after one-use token hash handoff', async () => {
  const source = await read('ekodibiz/site.js');
  const start = source.indexOf('function detailSlug()');
  const end = source.indexOf('function renderDetail(slug)', start);
  assert.ok(start > -1 && end > start);
  const find = (hash, search) => runInNewContext(source.slice(start, end) + '\ndetailSlug()', {
    location: { hash, search }, BUSINESS: business, URLSearchParams
  });
  assert.equal(find('#ekodi_token=one-time-proof', '?business=software'), 'software');
  assert.equal(find('', '?business=ai-ops'), 'ai-ops');
  assert.equal(find('#business/solar', '?business=software'), 'solar');
  assert.equal(find('#business', '?business=software'), null);
  assert.equal(find('#ekodi_token=one-time-proof', '?business=unknown'), null);
  assert.equal(find('', '?business=__proto__'), null);
});

test('public business cards stay accessible without login and preserve handoff contract', async () => {
  const [html, site, clientAuth] = await Promise.all([
    read('ekodibiz/index.html'), read('ekodibiz/site.js'), read('auth-site/client-auth.js')
  ]);
  for (const slug of businessSlugs) {
    assert.ok(html.includes('data-business="' + slug + '"'), slug);
    assert.ok(html.includes('href="#business/' + slug + '"'), slug);
  }
  assert.ok(site.includes('detailSlug()'));
  assert.ok(clientAuth.includes("target.hash=''"), 'auth handoff must remain one-use-token compatible');
});
