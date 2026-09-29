import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import platformRouter from '../platform-router-entry-worker.js';
const root=new URL('../sites/seonammedi/public/',import.meta.url);
test('seonammedi civic channel keeps source attribution, media evidence and privacy boundaries',async()=>{const [html,data,app]=await Promise.all([readFile(new URL('index.html',root),'utf8'),readFile(new URL('data.json',root),'utf8'),readFile(new URL('app.js',root),'utf8')]);assert.match(html,/사실은 출처와 함께/);assert.match(html,/후원·회계 공개/);assert.match(html,/개인정보/);assert.match(html,/원출처 링크/);const parsed=JSON.parse(data);assert.ok(parsed.timeline.length>=10);assert.ok(parsed.sources.every(s=>s.publisher&&s.url));assert.equal(parsed.finance.raised,null);assert.equal(parsed.mediaPolicy.mode,'source-link-first');for(const row of parsed.timeline){assert.ok(Array.isArray(row.links));assert.ok(Array.isArray(row.media));for(const media of row.media){assert.ok(['photo','video'].includes(media.type));assert.match(media.url,/^https:\/\//);assert.ok(media.source)}}assert.ok(parsed.timeline.some(row=>row.media.some(media=>media.type==='photo')));assert.match(app,/mediaLabel/);assert.match(app,/safeUrl/);});

test('canonical path, assets and feedback API use seonammedi',async()=>{const [html,app,build,router,wrangler]=await Promise.all([readFile(new URL('index.html',root),'utf8'),readFile(new URL('app.js',root),'utf8'),readFile(new URL('../scripts/build.mjs',import.meta.url),'utf8'),readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8'),readFile(new URL('../wrangler.site.toml',import.meta.url),'utf8')]);assert.match(html,/https:\/\/ekodi\.kr\/seonammedi\//);assert.match(html,/\/seonammedi\/app\.css/);assert.match(app,/\/api\/seonammedi\/voices/);assert.match(build,/sites\/seonammedi\/public/);assert.match(router,/SEONAMMEDI_PREFIX='\/seonammedi'/);assert.match(router,/DELETED_SEONAM_PREFIXES/);const workerFirst=(wrangler.match(/run_worker_first = \[(.*?)\]/s)?.[1].match(/\"[^\"]+\"/g)||[]);assert.ok(workerFirst.length<=100);assert.doesNotMatch(wrangler,/\"\/seonammedi\\\*\"/);assert.doesNotMatch(wrangler,/\"\/seonam-med\\\*\"/);assert.doesNotMatch(wrangler,/crons\s*=/);assert.match(html,/사이트 일일점검/);assert.match(app,/\/api\/seonammedi\/monitor/);});

test('Shared Site router serves seonammedi assets before generic workspace routing',async()=>{
  const env={ENVIRONMENT:'production',ASSETS:{fetch:async request=>{const path=new URL(request.url).pathname;const type=path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.js')?'application/javascript; charset=utf-8':path.endsWith('.json')?'application/json; charset=utf-8':'text/html; charset=utf-8';return new Response(path,{status:200,headers:{'content-type':type}})}}};
  const css=await platformRouter.fetch(new Request('https://ekodi.kr/seonammedi/app.css'),env,{});
  assert.equal(css.status,200);assert.equal(css.headers.get('x-ekodi-route'),'seonammedi-static');assert.match(await css.text(),/\/seonammedi\/app\.css/);
  const js=await platformRouter.fetch(new Request('https://ekodi.kr/seonammedi/app.js'),env,{});
  assert.equal(js.status,200);assert.equal(js.headers.get('x-ekodi-route'),'seonammedi-static');
  for(const deletedPath of ['/seonam-medi','/seonam-med']){const old=await platformRouter.fetch(new Request('https://ekodi.kr'+deletedPath+'/app.css?v=1'),env,{});assert.equal(old.status,404);assert.equal(old.headers.get('x-ekodi-route'),'seonammedi-deleted');}
});

test('site daily monitor is runtime-owned, source-only and media-evidence aware',async()=>{const [monitor,migration,mediaMigration,canonicalMigration,sourceMigration,app,data]=await Promise.all([readFile(new URL('../seonammedi-monitor.js',import.meta.url),'utf8'),readFile(new URL('../migrations/0104_seonam_medi_monitor.sql',import.meta.url),'utf8'),readFile(new URL('../migrations/0105_seonam_medi_media_evidence.sql',import.meta.url),'utf8'),readFile(new URL('../migrations/0106_seonammedi_canonical_names.sql',import.meta.url),'utf8'),readFile(new URL('../migrations/0107_seonammedi_source_metadata.sql',import.meta.url),'utf8'),readFile(new URL('app.js',root),'utf8'),readFile(new URL('data.json',root),'utf8')]);assert.match(monitor,/runSeonamMediDailyCheck/);assert.match(monitor,/aiProvider:false/);assert.match(monitor,/source_only/);assert.match(monitor,/news\.google\.com\/rss\/search/);assert.match(monitor,/enrichMedia/);assert.match(monitor,/og:video/);assert.match(monitor,/og:image/);assert.match(monitor,/mediaCandidateCount/);assert.match(monitor,/openapi\.naver\.com\/v1\/search\/blog\.json/);assert.match(monitor,/NAVER_CLIENT_ID/);assert.match(monitor,/sourceType:'blog'/);assert.match(migration,/seonam_medi_monitor_runs/);assert.match(migration,/seonam_medi_monitor_items/);assert.match(canonicalMigration,/CREATE TABLE IF NOT EXISTS seonammedi_monitor_runs/);assert.match(canonicalMigration,/CREATE TABLE IF NOT EXISTS seonammedi_monitor_items/);assert.match(canonicalMigration,/INSERT OR IGNORE INTO seonammedi_monitor_runs/);assert.match(canonicalMigration,/INSERT OR IGNORE INTO seonammedi_monitor_items/);assert.doesNotMatch(canonicalMigration,/RENAME TO|DROP TABLE/);assert.match(sourceMigration,/source_type/);assert.match(sourceMigration,/summary_text/);assert.match(mediaMigration,/media_type/);assert.match(mediaMigration,/media_state/);assert.match(app,/attachMonitorMedia/);assert.match(app,/monitorMatches/);assert.match(app,/원문 확인 필요/);const parsed=JSON.parse(data);assert.ok(parsed.timeline.some(row=>Array.isArray(row.monitorKeywords)&&row.monitorKeywords.length));assert.match(parsed.mediaPolicy.autoLinkRule,/근거자료 후보/);assert.ok(Array.isArray(parsed.publicPosts)&&parsed.publicPosts.length>=5);assert.ok(parsed.publicPosts.every(item=>item.date&&item.sourceType&&item.summary&&item.url));assert.match(app,/publicPostFilters/);});

test('seonammedi static headers allow its first-party CSS, JS and API calls',async()=>{const headers=await readFile(new URL('../_headers',import.meta.url),'utf8');assert.match(headers,/\/seonammedi\/\*/);assert.match(headers,/style-src 'self'/);assert.match(headers,/script-src 'self'/);assert.match(headers,/connect-src 'self'/);assert.doesNotMatch(headers,/\/seonammedi\*[\s\S]{0,300}script-src 'none'/);});

test('seonammedi daily monitoring reuses the existing Control API cron instead of adding a sixth Cloudflare trigger',async()=>{const [siteWrangler,apiWrangler,mission,monitor,router]=await Promise.all([readFile(new URL('../wrangler.site.toml',import.meta.url),'utf8'),readFile(new URL('../wrangler.api.toml',import.meta.url),'utf8'),readFile(new URL('../mission-control-entry-worker.js',import.meta.url),'utf8'),readFile(new URL('../seonammedi-monitor.js',import.meta.url),'utf8'),readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8')]);assert.doesNotMatch(siteWrangler,/\[triggers\]/);assert.match(apiWrangler,/crons = \["\*\/10 \* \* \* \*"\]/);assert.match(mission,/runSeonamMediDailyCheck/);assert.match(mission,/getUTCHours\(\) === 23/);assert.match(monitor,/status:'already_checked'/);assert.match(monitor,/existing-control-cron/);assert.doesNotMatch(router,/async scheduled\(_controller,env,ctx\)/);});


test('seonammedi source changes are wired to both Shared Site and Control API releases',async()=>{const [shared,control,manifestText]=await Promise.all([readFile(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8'),readFile(new URL('../.github/workflows/deploy-control-api.yml',import.meta.url),'utf8'),readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8')]);for(const marker of ["sites/seonammedi/public/**","seonammedi-monitor.js","seonammedi-civic-control.js","seonammedi-admin-control.js","migrations/0113_seonammedi_site_admin.sql","test/seonammedi-site.test.mjs"])assert.ok(shared.includes(marker),marker);for(const marker of ["seonammedi-monitor.js","seonammedi-civic-control.js","seonammedi-admin-control.js","migrations/0113_seonammedi_site_admin.sql","test/seonammedi-site.test.mjs"])assert.ok(control.split(marker).length>=3,marker);const manifest=JSON.parse(manifestText);const urls=new Set(manifest.worker.requests.map(item=>item.url));for(const url of ['https://ekodi.kr/seonammedi/','https://ekodi.kr/seonammedi/app.js','https://ekodi.kr/seonammedi/data.json','https://ekodi.kr/seonam-medi','https://ekodi.kr/seonam-med'])assert.ok(urls.has(url),url);const legacy=manifest.worker.requests.filter(item=>['https://ekodi.kr/seonam-medi','https://ekodi.kr/seonam-med'].includes(item.url));assert.ok(legacy.every(item=>item.statuses.includes(404)));});


test('seonammedi branding is canonical and legacy public paths are deleted',async()=>{const html=await readFile(new URL('index.html',root),'utf8');assert.match(html,/서남권 국립의대 소통센터/);assert.doesNotMatch(html,/시민소통센터/);assert.match(html,/\/seonammedi\/app\.css/);});


test('seonammedi admin stays site-local before and after Google authentication',async()=>{
  const [adminHtml,adminJs,auth,router,migration,manifestText]=await Promise.all([
    readFile(new URL('admin/index.html',root),'utf8'),
    readFile(new URL('admin/admin.js',root),'utf8'),
    readFile(new URL('../auth-site/auth.js',import.meta.url),'utf8'),
    readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8'),
    readFile(new URL('../migrations/0113_seonammedi_site_admin.sql',import.meta.url),'utf8'),
    readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8')
  ]);
  assert.match(adminHtml,/data-seonam-admin/);
  assert.match(adminHtml,/운영홈/);
  assert.doesNotMatch(adminHtml,/admin\/sites\/workspace|route=workspace&source=seonammedi|http-equiv="refresh"/);
  assert.match(adminJs,/site','portal'/);
  assert.match(adminJs,/return_to',location\.origin\+'\/seonammedi\/admin\/'/);
  assert.match(adminJs,/sb\.auth\.getSession\(\)/);
  assert.match(auth,/site==='portal'.*\/seonammedi\/admin/s);
  assert.match(router,/handleSeonamMediAdminApi/);
  assert.match(migration,/ohwon69@gmail\.com/);
  assert.match(migration,/board_admin/);
  assert.match(migration,/seonammedi\.notice\.manage/);
  assert.match(migration,/seonammedi\.channel\.manage/);
  const manifest=JSON.parse(manifestText);
  const probe=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/seonammedi/admin/');
  assert.ok(probe);
  assert.ok(probe.forbid.includes('/admin/sites/workspace'));
});

test('seonammedi admin route is served locally with noindex instead of redirecting to platform admin',async()=>{
  const env={ENVIRONMENT:'production',ASSETS:{fetch:async request=>new Response('<!doctype html><title>local admin</title>',{status:200,headers:{'content-type':'text/html; charset=utf-8'}})}};
  const response=await platformRouter.fetch(new Request('https://ekodi.kr/seonammedi/admin/'),env,{});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-route'),'seonammedi-static');
  assert.match(response.headers.get('x-robots-tag')||'',/noindex/);
  assert.equal(response.headers.get('location'),null);
});
