import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir, mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
  ensureFooterTraffic, withFooterTraffic, injectFooterTrafficIntoHtml, htmlHasFooterTraffic,
  isFooterTrafficPublicPath, extendFooterTrafficCsp, shouldGuaranteeFooterTraffic, FOOTER_TRAFFIC_HEADER,
} from '../footer-traffic-guarantee.js';
import {runFooterTrafficPostbuild, parseWorkerFirst, isWorkerFirst, cspAllowsFooterTraffic} from '../scripts/footer-traffic-postbuild.mjs';

// FOOTER-TRAFFIC-GUARANTEE (owner directive 2026-11-08): every EKODI public
// site, existing and future, shows footer visit statistics. A new production
// route can only ship if it either applies the guarantee or is listed below
// with a reason it never serves public HTML pages.
const FOOTER_TRAFFIC_EXEMPT = {
  'wrangler.biz-legacy.toml': 'redirect-only legacy domain (ekodibiz.kr → ekodi.kr/ekodibiz)',
  'wrangler.legacy-redirect.toml': 'redirect-only legacy domains → ekodi.kr apex paths',
  'wrangler.cgma-naver-proof.toml': 'single search-engine ownership verification file',
  'wrangler.church-naver-proof.toml': 'single search-engine ownership verification file',
  'wrangler.ekodibiz.toml': 'payment architecture API, no public pages',
  'wrangler.marketing-domains.toml': 'API-only host',
  'wrangler.marketing-publishing.toml': 'API-only host',
  'wrangler.personal-finance.toml': 'API-only host',
  'wrangler.workspace-platform.toml': 'API-only host',
  'wrangler.workspace-platform-bootstrap.toml': 'API-only host',
  'wrangler.service-admin-entry.toml': 'admin-only routes (*/admin*)',
  'wrangler.storage.toml': 'private drive storage host, no public site pages',
  'sites/ekodi-mall/api/wrangler.toml': 'API-only host',
  'sites/ekodi-insurance/api/wrangler.toml': 'API-only host',
};
// Either the explicit guarantee, or the shared Shell user UI (which boots the
// same shared footer and visit summary on every public page it renders).
const COVERAGE = /\b(?:withFooterTraffic|ensureFooterTraffic|injectEkodiShell|injectEkodiUserUi)\b/;

async function productionConfigs() {
  const out = [];
  for (const name of await readdir('.')) {
    if (!/^wrangler\..*\.toml$/.test(name) || /(?:staging|development|build|dev)\b/.test(name)) continue;
    out.push(name);
  }
  for (const site of await readdir('sites')) {
    for (const rel of ['wrangler.toml', 'api/wrangler.toml', 'public/wrangler.toml']) {
      try { await readFile(join('sites', site, rel), 'utf8'); out.push(join('sites', site, rel)); } catch {}
    }
  }
  return out;
}

test('every production route either guarantees footer visit stats or is explicitly exempt', async () => {
  const missing = [];
  for (const config of await productionConfigs()) {
    const toml = await readFile(config, 'utf8');
    if (!/^\s*pattern\s*=/m.test(toml)) continue; // no public route
    if (FOOTER_TRAFFIC_EXEMPT[config]) continue;
    const main = toml.match(/^main\s*=\s*"([^"]+)"/m)?.[1];
    assert.ok(main, `${config}: main entry`);
    const base = config.includes('/') ? config.slice(0, config.lastIndexOf('/') + 1) : '';
    const source = await readFile(base + main, 'utf8');
    if (COVERAGE.test(source)) continue;
    // A thin deploy entry may re-export the HTTP worker it imports by default.
    const defaultImport = source.match(/^import\s+(\w+)\s+from\s+'(\.[^']+)';/m);
    const reexported = defaultImport && new RegExp(`(?:export default|=)\\s*${defaultImport[1]}\\b`).test(source);
    if (reexported) {
      const dir = (base + main).includes('/') ? (base + main).slice(0, (base + main).lastIndexOf('/') + 1) : '';
      if (COVERAGE.test(await readFile(dir + defaultImport[2].replace(/^\.\//, ''), 'utf8'))) continue;
    }
    missing.push(`${config} (${main})`);
  }
  assert.deepEqual(missing, [], 'New public route without footer visit stats. Wrap its worker with withFooterTraffic() from footer-traffic-guarantee.js, or add a documented non-HTML exemption.');
});

test('exemptions stay honest: exempt configs must still exist', async () => {
  for (const config of Object.keys(FOOTER_TRAFFIC_EXEMPT)) await readFile(config, 'utf8');
});

test('Shared Site entry applies the guarantee to every finalized response', async () => {
  const source = await readFile('platform-router-entry-worker.js', 'utf8');
  assert.match(source, /import \{ ensureFooterTraffic \} from '\.\/footer-traffic-guarantee\.js'/);
  const finalize = source.slice(source.indexOf('const finalize=response=>{'), source.indexOf('const incomingUrl=new URL(request.url);'));
  assert.match(finalize, /ensureFooterTraffic\(response,request\)/);
  assert.ok(finalize.indexOf('ensureFooterTraffic') < finalize.indexOf('applyPlatformSecurityHeaders'));
});

test('direct ekodi.kr path workers that bypass the Shared Site are wrapped', async () => {
  for (const file of ['church-history-worker.js', 'delivery-worker.js', 'ekodibiz-pay-gateway-worker.js', 'ekodipay-worker.js',
    'local-commerce-worker.js', 'ministry-news-worker.js', 'qtin-order-worker.js', 'support-worker.js',
    'seonammedi-domain-gateway.js', 'services/independent-board/worker.js']) {
    const source = await readFile(file, 'utf8');
    assert.match(source, /export default withFooterTraffic\(ekodiWorkerEntry\);/, file);
  }
});

test('static build injects stats into every asset-first public page (future pages included)', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.match(pkg.scripts.build, /node scripts\/footer-traffic-postbuild\.mjs$/, 'postbuild runs last');
  const root = await mkdtemp(join(tmpdir(), 'ekodi-footer-'));
  try {
    await mkdir(join(root, 'dist/new-future-site'), {recursive: true});
    await mkdir(join(root, 'dist/admin'), {recursive: true});
    await mkdir(join(root, 'dist/worker'), {recursive: true});
    await writeFile(join(root, 'wrangler.site.toml'), 'run_worker_first = ["/worker*", "/"]\n');
    await writeFile(join(root, 'dist/_headers'), "/*\n  Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; script-src 'none'\n");
    await writeFile(join(root, 'dist/new-future-site/index.html'), '<!doctype html><html lang="ko"><body><main>new</main><footer class="site-footer">x</footer></body></html>');
    await writeFile(join(root, 'dist/admin/index.html'), '<html><body>admin</body></html>');
    await writeFile(join(root, 'dist/worker/index.html'), '<html><body>worker</body></html>');
    const report = await runFooterTrafficPostbuild({root});
    assert.deepEqual(report.injected, ['/new-future-site/']);
    assert.ok(report.excluded.includes('/admin/'));
    assert.ok(report.workerFirst.includes('/worker/'));
    const page = await readFile(join(root, 'dist/new-future-site/index.html'), 'utf8');
    assert.ok(htmlHasFooterTraffic(page));
    assert.match(page, /<html lang="ko" data-ekodi-shell-surface="public">/);
    assert.ok(page.indexOf('native-visit-beacon.js') < page.indexOf('user-ui-footer.js'));
    assert.doesNotMatch(await readFile(join(root, 'dist/admin/index.html'), 'utf8'), /user-ui-footer/);
    const headers = await readFile(join(root, 'dist/_headers'), 'utf8');
    assert.match(headers, /\/new-future-site\/\n  ! Content-Security-Policy\n  Content-Security-Policy: [^\n]*script-src 'self'[^\n]*connect-src 'self'|\/new-future-site\/\n  ! Content-Security-Policy\n  Content-Security-Policy: [^\n]*connect-src 'self'/);
    assert.match(headers, /^\/\*\n  Content-Security-Policy: [^\n]*script-src 'none'/m, 'global script-free default unchanged');
    // Idempotent: a second run changes nothing and does not duplicate rules.
    const again = await runFooterTrafficPostbuild({root});
    assert.deepEqual(again.injected, []);
    assert.equal((await readFile(join(root, 'dist/_headers'), 'utf8')).split('FOOTER-TRAFFIC-GUARANTEE').length - 1, 1);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('real Shared Site worker-first rules parse and route correctly', async () => {
  const rules = parseWorkerFirst(await readFile('wrangler.site.toml', 'utf8'));
  assert.ok(rules.length > 20);
  assert.equal(isWorkerFirst('/seonammedi/notices/', rules), true);
  assert.equal(isWorkerFirst('/pyeonggongmok/', rules), false);
  assert.equal(isWorkerFirst('/admin/app.js', rules), false);
  assert.equal(cspAllowsFooterTraffic("default-src 'none'; script-src 'none'"), false);
  assert.equal(cspAllowsFooterTraffic("default-src 'self'; script-src 'self'; connect-src 'self'"), true);
});

test('public/private path policy', () => {
  for (const path of ['/', '/ekodichurch/', '/sosik', '/qtin/', '/support/faq', '/privacy', '/terms', '/mokpo-presbytery/mission/', '/hub.html'])
    assert.equal(isFooterTrafficPublicPath(path), true, path);
  for (const path of ['/admin', '/ekodichurch/admin/history', '/api/sosik', '/my/', '/auth/login', '/control', '/work/x',
    '/seonammedi/finance/', '/verify/adult/', '/oauth-consent.html', '/mail/inbox', '/qtin/admin'])
    assert.equal(isFooterTrafficPublicPath(path), false, path);
});

test('runtime guarantee: only public 200 HTML GETs, never twice, never over the full Shell', () => {
  const html = (headers = {}) => new Response('<html><body>x</body></html>', {headers: {'content-type': 'text/html; charset=utf-8', ...headers}});
  const get = path => new Request('https://ekodi.kr' + path);
  assert.equal(shouldGuaranteeFooterTraffic(html(), get('/sosik')), true);
  assert.equal(shouldGuaranteeFooterTraffic(html(), get('/ekodichurch/admin/history')), false);
  assert.equal(shouldGuaranteeFooterTraffic(html({'x-ekodi-user-ui': 'v9'}), get('/ekodimall')), false);
  assert.equal(shouldGuaranteeFooterTraffic(html({[FOOTER_TRAFFIC_HEADER]: 'guarantee-v1'}), get('/')), false);
  assert.equal(shouldGuaranteeFooterTraffic(new Response('{}', {headers: {'content-type': 'application/json'}}), get('/')), false);
  assert.equal(shouldGuaranteeFooterTraffic(new Response('', {status: 404, headers: {'content-type': 'text/html'}}), get('/')), false);
  assert.equal(shouldGuaranteeFooterTraffic(html(), new Request('https://ekodi.kr/', {method: 'POST'})), false);
  const marked = ensureFooterTraffic(html(), get('/sosik'));
  assert.equal(marked.headers.get(FOOTER_TRAFFIC_HEADER), 'guarantee-v1');
});

test('wrapper preserves other Worker handlers and marks public HTML', async () => {
  const worker = {async fetch() { return new Response('<html><body>hi</body></html>', {headers: {'content-type': 'text/html'}}); }, async scheduled() { return 'cron'; }};
  const wrapped = withFooterTraffic(worker);
  assert.equal(await wrapped.scheduled(), 'cron');
  assert.equal(withFooterTraffic(wrapped), wrapped);
  const response = await wrapped.fetch(new Request('https://ekodi.kr/support'), {}, {});
  assert.equal(response.headers.get(FOOTER_TRAFFIC_HEADER), 'guarantee-v1');
  assert.equal(await response.text(), '<html><body>hi</body></html>');
});

test('static injection is idempotent and keeps an existing surface marker', () => {
  const once = injectFooterTrafficIntoHtml('<html data-ekodi-shell-surface="workspace"><body><footer>f</footer></body></html>');
  assert.equal(injectFooterTrafficIntoHtml(once), once);
  assert.match(once, /data-ekodi-shell-surface="workspace"/);
  assert.doesNotMatch(once, /data-ekodi-shell-surface="public"/);
  assert.ok(once.indexOf('user-ui-footer.js') < once.indexOf('</body>'));
});

test('CSP extension allows only the EKODI origin and never weakens to wildcards', () => {
  const extended = extendFooterTrafficCsp("default-src 'self'; script-src 'self' https://cdn.example; connect-src 'none'");
  assert.match(extended, /script-src 'self' https:\/\/cdn\.example https:\/\/ekodi\.kr/);
  assert.match(extended, /connect-src https:\/\/ekodi\.kr/);
  assert.doesNotMatch(extended, /\*|'unsafe-eval'/);
  assert.equal(extendFooterTrafficCsp("default-src 'self'", {sameOrigin: true}), "default-src 'self'");
});

test('shared legal pages show the root site summary instead of no stats', async () => {
  const footer = await readFile('shell/user-ui-footer.js', 'utf8');
  assert.match(footer, /const sharedLegal=\['privacy','terms'\]\.includes\(root\)/);
  assert.match(footer, /url\.searchParams\.set\('site_path',sharedLegal\?'':root\+child\)/);
  assert.doesNotMatch(footer, /\['admin','auth','api','my','privacy','terms'\]\.includes\(root\)/);
});
