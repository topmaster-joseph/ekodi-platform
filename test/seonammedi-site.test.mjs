import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import platformRouter from '../platform-router-entry-worker.js';
const root=new URL('../sites/seonammedi/public/',import.meta.url);
test('seonammedi notice login uses central EKODI auth and preserves customer-domain return',async()=>{const [app,auth,policy]=await Promise.all([readFile(new URL('app.js',root),'utf8'),readFile(new URL('../auth-site/auth.js',import.meta.url),'utf8'),readFile(new URL('../config/site-execution-enforcement.json',import.meta.url),'utf8')]);assert.match(app,/new URL\('https:\/\/ekodi\.kr\/auth\/'\)/);assert.doesNotMatch(app,/new URL\('\/auth\/',location\.origin\)/);assert.match(app,/return_to',location\.origin\+'\/\?compose=notice#notices'/);assert.match(auth,/https:\/\/seonammedi\.kr/);assert.match(auth,/서남권국립의대\.kr/);const parsed=JSON.parse(policy);assert.equal(parsed.authenticationEntry?.status,'enforced');assert.equal(parsed.authenticationEntry?.siteLocalAuthPathForbidden,true);assert.equal(parsed.authenticationEntry?.perSiteOptOutAllowed,false);});


test('seonammedi notice auth handoff returns to the notice composer instead of activity history',async()=>{
  const app=await readFile(new URL('app.js',root),'utf8');
  assert.match(app,/consumeNoticeHandoff/);
  assert.match(app,/\/api\/seonammedi\/admin\/auth\/exchange/);
  assert.match(app,/localStorage\.setItem\(NOTICE_SESSION_KEY/);
  assert.match(app,/history\.replaceState\(null,'',location\.pathname\+location\.search\+'#notices'\)/);
  assert.match(app,/raw\.includes\('ekodi_token='\).*compose.*notices/s);
  assert.match(app,/if\(compose&&noticeToken\(\)\)\{noticeCompose\.hidden=false/);
});


test('seonammedi records the post-August-30 bidaewee activity chronology',async()=>{
  const [dataText,control]=await Promise.all([
    readFile(new URL('data.json',root),'utf8'),
    readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8')
  ]);
  const parsed=JSON.parse(dataText);
  const rows=parsed.timeline.filter(row=>row.category==='비대위 활동'&&row.date>='2026.08.31');
  const dates=rows.map(row=>row.date);
  for(const date of ['2026.09.02','2026.09.03','2026.09.04','2026.09.05','2026.09.07','2026.09.08','2026.09.09','2026.09.14','2026.09.21','2026.09.22'])assert.ok(dates.includes(date),date);
  assert.ok(rows.every(row=>Array.isArray(row.links)&&row.links.length>=1));
  assert.match(control,/seed-bidaewee-20260904/);
  assert.match(control,/seed-bidaewee-20260922/);
});


test('seonammedi post-selection timeline migration reconciles production D1',async()=>{
  const [migration,control]=await Promise.all([
    readFile(new URL('../migrations/0124_seonammedi_post_selection_timeline.sql',import.meta.url),'utf8'),
    readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8')
  ]);
  for(const date of ['2026.09.02','2026.09.03','2026.09.04','2026.09.05','2026.09.07','2026.09.08','2026.09.09','2026.09.14','2026.09.21','2026.09.22'])assert.ok(migration.includes(date),date);
  assert.match(migration,/ON CONFLICT\(legacy_key\) DO UPDATE SET/);
  assert.doesNotMatch(migration,/DROP TABLE|DELETE FROM|ALTER TABLE .* RENAME/);
  assert.match(control,/SELECT id,created_by FROM seonammedi_timeline WHERE legacy_key=\?/);
  assert.match(control,/system-seed/);
});

test('seonammedi civic channel keeps source attribution, media evidence and privacy boundaries',async()=>{const [html,data,app]=await Promise.all([readFile(new URL('index.html',root),'utf8'),readFile(new URL('data.json',root),'utf8'),readFile(new URL('app.js',root),'utf8')]);assert.match(html,/사실은 출처와 함께/);assert.match(html,/<h2>회계<\/h2>/);assert.match(html,/개인정보/);const parsed=JSON.parse(data);assert.ok(parsed.timeline.length>=10);assert.ok(parsed.sources.every(s=>s.publisher&&s.url));assert.equal(parsed.finance.raised,null);assert.equal(parsed.mediaPolicy.mode,'source-link-first');for(const row of parsed.timeline){assert.ok(Array.isArray(row.links));assert.ok(Array.isArray(row.media));for(const media of row.media){assert.ok(['photo','video'].includes(media.type));assert.match(media.url,/^https:\/\//);assert.ok(media.source)}}assert.ok(parsed.timeline.some(row=>row.media.some(media=>media.type==='photo')));assert.match(app,/mediaLabel/);assert.match(app,/safeUrl/);});

test('canonical path, assets and feedback API use seonammedi',async()=>{const [html,app,build,router,wrangler]=await Promise.all([readFile(new URL('index.html',root),'utf8'),readFile(new URL('app.js',root),'utf8'),readFile(new URL('../scripts/build.mjs',import.meta.url),'utf8'),readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8'),readFile(new URL('../wrangler.site.toml',import.meta.url),'utf8')]);assert.match(html,/https:\/\/seonammedi\.kr\//);assert.match(html,/\/seonammedi\/app\.css/);assert.match(app,/\/board\/api\/posts/);assert.match(build,/sites\/seonammedi\/public/);assert.match(router,/SEONAMMEDI_PREFIX='\/seonammedi'/);assert.match(router,/DELETED_SEONAM_PREFIXES/);const workerFirst=(wrangler.match(/run_worker_first = \[(.*?)\]/s)?.[1].match(/\"[^\"]+\"/g)||[]);assert.ok(workerFirst.length<=100);assert.doesNotMatch(wrangler,/\"\/seonammedi\\\*\"/);assert.doesNotMatch(wrangler,/\"\/seonam-med\\\*\"/);assert.doesNotMatch(wrangler,/crons\s*=/);assert.doesNotMatch(html,/사이트 일일점검|monitorBadge|id="monitor"/);assert.match(app,/\/api\/seonammedi\/monitor/);});

test('seonammedi civic canonical D1 table is provisioned by additive migration',async()=>{const [migration,durableMigration,civic]=await Promise.all([readFile(new URL('../migrations/0115_seonammedi_civic_canonical.sql',import.meta.url),'utf8'),readFile(new URL('../migrations/0118_seonammedi_voice_durable_ingress.sql',import.meta.url),'utf8'),readFile(new URL('../seonammedi-civic-control.js',import.meta.url),'utf8')]);assert.match(migration,/CREATE TABLE IF NOT EXISTS seonammedi_civic_voices/);assert.match(migration,/idx_seonammedi_civic_voices_created/);assert.doesNotMatch(migration,/DROP TABLE|ALTER TABLE .* RENAME/);assert.match(durableMigration,/ADD COLUMN submission_key/);assert.match(durableMigration,/idx_seonammedi_civic_voices_submission/);assert.doesNotMatch(durableMigration,/DROP TABLE|ALTER TABLE .* RENAME/);assert.match(civic,/await ensureSubmissionKey\(db\)/);});

test('seonammedi public civic list is read-only and never runs request-time schema DDL',async()=>{
  const civic=await readFile(new URL('../seonammedi-civic-control.js',import.meta.url),'utf8');
  const start=civic.indexOf('async function listPublicVoices');
  const end=civic.indexOf('async function createPublicReply',start);
  const listBlock=civic.slice(start,end);
  assert.match(listBlock,/SELECT id,category,display_name,message,created_at,updated_at/);
  assert.doesNotMatch(listBlock,/ensureSchema|CREATE TABLE|ALTER TABLE|CREATE INDEX/);
});

test('seonammedi civic endpoint exposes durable queue readiness and a read-only health gate',async()=>{const [civic,app,policy]=await Promise.all([readFile(new URL('../seonammedi-civic-control.js',import.meta.url),'utf8'),readFile(new URL('app.js',root),'utf8'),readFile(new URL('../platform-security-policy.js',import.meta.url),'utf8')]);assert.match(civic,/HEALTH_PATH=API_PATH\+'\/health'/);const healthBlock=civic.slice(civic.indexOf('async function health'),civic.indexOf('async function applyIngressRateLimit'));assert.match(healthBlock,/sqlite_master/);assert.match(healthBlock,/submission_key/);assert.doesNotMatch(healthBlock,/ensureSchema|CREATE TABLE|ALTER TABLE|CREATE INDEX/);assert.match(civic,/enqueueDurableWrite/);assert.match(civic,/durable_queue_unavailable/);assert.match(civic,/write_ingress_failed/);assert.match(civic,/submissionId/);assert.doesNotMatch(civic,/ALTER TABLE seonam_med_civic_voices RENAME/);assert.match(app,/body\.message\|\|body\.error\|\|body\.code/);assert.match(policy,/SELF_PROTECTED_PUBLIC_WRITE_PATHS/);});

test('Shared Site router serves seonammedi assets before generic workspace routing',async()=>{
  const env={ENVIRONMENT:'production',ASSETS:{fetch:async request=>{const path=new URL(request.url).pathname;const type=path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.js')?'application/javascript; charset=utf-8':path.endsWith('.json')?'application/json; charset=utf-8':'text/html; charset=utf-8';return new Response(path,{status:200,headers:{'content-type':type}})}}};
  const css=await platformRouter.fetch(new Request('https://ekodi.kr/seonammedi/app.css'),env,{});
  assert.equal(css.status,200);assert.equal(css.headers.get('x-ekodi-route'),'seonammedi-static');assert.match(await css.text(),/\/seonammedi\/app\.css/);
  const js=await platformRouter.fetch(new Request('https://ekodi.kr/seonammedi/app.js'),env,{});
  assert.equal(js.status,200);assert.equal(js.headers.get('x-ekodi-route'),'seonammedi-static');
  const minutes=await platformRouter.fetch(new Request('https://ekodi.kr/seonammedi/minutes/'),env,{});
  assert.equal(minutes.status,200);assert.equal(minutes.headers.get('x-ekodi-route'),'seonammedi-static');assert.equal(minutes.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
  for(const deletedPath of ['/seonam-medi','/seonam-med']){const old=await platformRouter.fetch(new Request('https://ekodi.kr'+deletedPath+'/app.css?v=1'),env,{});assert.equal(old.status,404);assert.equal(old.headers.get('x-ekodi-route'),'seonammedi-deleted');}
});

test('site hourly monitor is runtime-owned, source-only and media-evidence aware',async()=>{const [monitor,migration,mediaMigration,canonicalMigration,sourceMigration,app,data]=await Promise.all([readFile(new URL('../seonammedi-monitor.js',import.meta.url),'utf8'),readFile(new URL('../migrations/0104_seonam_medi_monitor.sql',import.meta.url),'utf8'),readFile(new URL('../migrations/0105_seonam_medi_media_evidence.sql',import.meta.url),'utf8'),readFile(new URL('../migrations/0106_seonammedi_canonical_names.sql',import.meta.url),'utf8'),readFile(new URL('../migrations/0107_seonammedi_source_metadata.sql',import.meta.url),'utf8'),readFile(new URL('app.js',root),'utf8'),readFile(new URL('data.json',root),'utf8')]);assert.match(monitor,/runSeonamMediHourlyCheck/);assert.match(monitor,/aiProvider:false/);assert.match(monitor,/source_only/);assert.match(monitor,/news\.google\.com\/rss\/search/);assert.match(monitor,/enrichMedia/);assert.match(monitor,/og:video/);assert.match(monitor,/og:image/);assert.match(monitor,/mediaCandidateCount/);assert.match(monitor,/openapi\.naver\.com\/v1\/search\/blog\.json/);assert.match(monitor,/NAVER_CLIENT_ID/);assert.match(monitor,/sourceType:'blog'/);assert.match(migration,/seonam_medi_monitor_runs/);assert.match(migration,/seonam_medi_monitor_items/);assert.match(canonicalMigration,/CREATE TABLE IF NOT EXISTS seonammedi_monitor_runs/);assert.match(canonicalMigration,/CREATE TABLE IF NOT EXISTS seonammedi_monitor_items/);assert.match(canonicalMigration,/INSERT OR IGNORE INTO seonammedi_monitor_runs/);assert.match(canonicalMigration,/INSERT OR IGNORE INTO seonammedi_monitor_items/);assert.doesNotMatch(canonicalMigration,/RENAME TO|DROP TABLE/);assert.match(sourceMigration,/source_type/);assert.match(sourceMigration,/summary_text/);assert.match(mediaMigration,/media_type/);assert.match(mediaMigration,/media_state/);assert.match(app,/attachMonitorMedia/);assert.match(app,/monitorMatches/);assert.match(app,/원문 확인 필요/);const parsed=JSON.parse(data);assert.ok(parsed.timeline.some(row=>Array.isArray(row.monitorKeywords)&&row.monitorKeywords.length));assert.match(parsed.mediaPolicy.autoLinkRule,/근거자료 후보/);assert.ok(Array.isArray(parsed.publicPosts)&&parsed.publicPosts.length>=5);assert.ok(parsed.publicPosts.every(item=>item.date&&item.sourceType&&item.summary&&item.url));assert.match(app,/materialFilters/);});

test('hourly monitor results automatically refresh the public homepage without auto-publishing blogs as facts',async()=>{const [html,app,css]=await Promise.all([readFile(new URL('index.html',root),'utf8'),readFile(new URL('app.js',root),'utf8'),readFile(new URL('app.css',root),'utf8')]);assert.match(html,/id="homeLatestUpdates"/);assert.match(html,/id="homeLatestList"/);assert.match(html,/1시간마다 자동 갱신/);assert.match(app,/function monitorHomeRows/);assert.match(app,/item\.source_type!=='blog'/);assert.match(app,/selected\.some\(prev=>\(url&&prev\.url===url\)\|\|\(date&&prev\.date===date&&timelineTitleSimilarity\(prev\.title,title\)>=0\.72\)\)/);assert.match(app,/자동수집 · 원문 확인/);assert.match(app,/siteReady\.finally\(\(\)=>loadMonitor\(\)\)/);assert.match(app,/15\*60\*1000/);assert.match(app,/EKODI 자동갱신/);assert.match(css,/\.home-latest-list/);assert.match(css,/\.home-latest-card/);});

test('public view isolation keeps late activity rendering from reopening timeline over home or channels',async()=>{
  const app=await readFile(new URL('app.js',root),'utf8');
  assert.match(app,/const statusVisible=document\.querySelector\('\[data-view-link="status"\]\[aria-current="page"\]'\)!==null/);
  assert.match(app,/timeline\.hidden=!statusVisible\|\|key!=='timeline'/);
  assert.match(app,/materials\.hidden=!statusVisible\|\|key==='timeline'/);
  assert.match(app,/window\.addEventListener\('hashchange',syncViewFromLocation\)/);
  assert.ok(app.indexOf("document.querySelectorAll('[data-view-section]').forEach")<app.indexOf("if(key==='status')showStatusTab(activeStatusTab)"));
});

test('seonammedi static headers allow its first-party CSS, JS, API calls and approved social embeds',async()=>{const headers=await readFile(new URL('../_headers',import.meta.url),'utf8');assert.match(headers,/\/seonammedi\/\*/);assert.match(headers,/style-src 'self'/);assert.match(headers,/script-src 'self'/);assert.match(headers,/connect-src 'self'/);assert.match(headers,/\/seonammedi\/\*[\s\S]{0,500}frame-src https:\/\/www\.instagram\.com https:\/\/www\.youtube-nocookie\.com https:\/\/www\.tiktok\.com/);assert.match(headers,/\/seonammedi\/admin\/\*[\s\S]{0,500}connect-src 'self' https:\/\/renzehysxirjilvdxacv\.supabase\.co/);assert.doesNotMatch(headers,/\/seonammedi\*[\s\S]{0,300}script-src 'none'/);});

test('seonammedi hourly monitoring reuses the existing Control API cron instead of adding a sixth Cloudflare trigger',async()=>{const [siteWrangler,apiWrangler,mission,monitor,router]=await Promise.all([readFile(new URL('../wrangler.site.toml',import.meta.url),'utf8'),readFile(new URL('../wrangler.api.toml',import.meta.url),'utf8'),readFile(new URL('../mission-control-entry-worker.js',import.meta.url),'utf8'),readFile(new URL('../seonammedi-monitor.js',import.meta.url),'utf8'),readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8')]);assert.doesNotMatch(siteWrangler,/\[triggers\]/);assert.match(apiWrangler,/crons = \["\*\/10 \* \* \* \*"\]/);assert.match(mission,/runSeonamMediHourlyCheck/);assert.match(mission,/getUTCMinutes\(\) === 0/);assert.match(monitor,/status:'already_checked'/);assert.match(monitor,/existing-control-cron/);assert.doesNotMatch(router,/async scheduled\(_controller,env,ctx\)/);});


test('seonammedi source changes are wired to both Shared Site and Control API releases',async()=>{const [shared,control,manifestText]=await Promise.all([readFile(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8'),readFile(new URL('../.github/workflows/deploy-control-api.yml',import.meta.url),'utf8'),readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8')]);for(const marker of ["sites/seonammedi/public/**","seonammedi-monitor.js","seonammedi-civic-control.js","seonammedi-admin-control.js","migrations/0113_seonammedi_site_admin.sql","migrations/0116_seonammedi_full_menu_admin.sql","test/seonammedi-site.test.mjs"])assert.ok(shared.includes(marker),marker);for(const marker of ["seonammedi-monitor.js","seonammedi-civic-control.js","seonammedi-admin-control.js","migrations/0113_seonammedi_site_admin.sql","migrations/0116_seonammedi_full_menu_admin.sql","test/seonammedi-site.test.mjs"])assert.ok(control.split(marker).length>=3,marker);const manifest=JSON.parse(manifestText);const urls=new Set(manifest.worker.requests.map(item=>item.url));for(const url of ['https://ekodi.kr/seonammedi/','https://ekodi.kr/seonammedi/app.js','https://ekodi.kr/api/seonammedi/voices/health','https://ekodi.kr/seonammedi/data.json','https://ekodi.kr/seonam-medi','https://ekodi.kr/seonam-med'])assert.ok(urls.has(url),url);const publicProbe=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/seonammedi/');assert.ok(publicProbe);assert.ok(!publicProbe.expect.includes('사이트 일일점검'));const adminProbe=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/seonammedi/admin/');assert.ok(adminProbe);for(const label of ['사이트 점검','정적 상태','동적 상태'])assert.ok(!adminProbe.expect.includes(label),label);const legacy=manifest.worker.requests.filter(item=>['https://ekodi.kr/seonam-medi','https://ekodi.kr/seonam-med'].includes(item.url));assert.ok(legacy.every(item=>item.statuses.includes(404)));});


test('seonammedi branding is canonical and legacy public paths are deleted',async()=>{const html=await readFile(new URL('index.html',root),'utf8');assert.match(html,/서남권 국립의대 소통센터/);assert.doesNotMatch(html,/시민소통센터/);assert.match(html,/\/seonammedi\/app\.css/);});



test('seonammedi admin restores unique panel and organization tab URL state',async()=>{
  const adminJs=await readFile(new URL('admin/admin.js',root),'utf8');
  assert.match(adminJs,/ADMIN_ROUTE_PANELS=new Set\(\['dashboard','status','channels','voices','finance','notices','organization','minutes','access'\]\)/);
  assert.match(adminJs,/searchParams\.set\('panel',panel\)/);
  assert.match(adminJs,/searchParams\.set\('org',org\)/);
  assert.match(adminJs,/searchParams\.set\('records','review'\)/);
  assert.match(adminJs,/restoreAdminRoute\(\{replace:true\}\)/);
  assert.match(adminJs,/addEventListener\('popstate',\(\)=>restoreAdminRoute\(\)\)/);
  assert.match(adminJs,/showOrgAdminTab\(params\.get\('org'\)\|\|'bidae',\{route:false\}\)/);
});

test('seonammedi admin stays site-local before and after Google authentication',async()=>{
  const [adminHtml,adminJs,auth,router,migration,manifestText]=await Promise.all([
    readFile(new URL('admin/index.html',root),'utf8'),
    readFile(new URL('admin/admin.js',root),'utf8'),
    readFile(new URL('../auth-site/client-auth.js',import.meta.url),'utf8'),
    readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8'),
    readFile(new URL('../migrations/0113_seonammedi_site_admin.sql',import.meta.url),'utf8'),
    readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8')
  ]);
  assert.match(adminHtml,/data-seonam-admin/);
  assert.match(adminHtml,/운영홈/);
  assert.doesNotMatch(adminHtml,/admin\/sites\/workspace|route=workspace&source=seonammedi|http-equiv="refresh"/);
  assert.match(adminJs,/site','seonammedi'/);
  assert.match(adminJs,/function adminReturnUrl\(\)/);
  assert.match(adminJs,/location\.hostname==='ekodi\.kr'/);
  assert.match(adminJs,/location\.pathname==='\/seonammedi\/admin'/);
  assert.match(adminJs,/location\.pathname\.startsWith\('\/seonammedi\/admin\/'\)/);
  assert.match(adminJs,/internal\?'\/seonammedi\/admin\/':'\/admin\/'/);
  assert.match(adminJs,/return_to',adminReturnUrl\(\)/);
  assert.match(adminJs,/CENTRAL_SESSION_KEY='sb-renzehysxirjilvdxacv-auth-token'/);
  assert.match(adminJs,/localStorage\.getItem\(CENTRAL_SESSION_KEY\)/);
  assert.doesNotMatch(adminJs,/cdn\.jsdelivr\.net|createClient\(/);
  assert.match(auth,/seonammedi:\{name:'서남권 국립의대 소통센터'/);
  assert.match(router,/handleSeonamMediAdminApi/);
  assert.match(migration,/ohwon69@gmail\.com/);
  assert.match(migration,/board_admin/);
  assert.match(migration,/seonammedi\.notice\.manage/);
  assert.match(migration,/seonammedi\.channel\.manage/);
  assert.doesNotMatch(migration,/seonammedi\.content\.manage/);
  assert.match(await readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8'),/CONTENT_CAP='seonammedi\.content\.manage'/);
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


test('organization uses representative council and supports 가나다 participant organizations',async()=>{
  const [html,app,data]=await Promise.all([readFile(new URL('../sites/seonammedi/public/index.html',import.meta.url),'utf8'),readFile(new URL('../sites/seonammedi/public/app.js',import.meta.url),'utf8'),readFile(new URL('../sites/seonammedi/public/data.json',import.meta.url),'utf8')]);
  const parsed=JSON.parse(data);
  assert.match(html,/data-view-link="organization"/);
  assert.match(html,/id="organization"[^>]*data-view-section="organization"/);
  assert.equal(parsed.organization.levels[0].name,'대표자회의');
  assert.ok(parsed.organization.committees.some(x=>x.name==='홍보소통위원회'));
  assert.ok(Array.isArray(parsed.organization.participants));
  assert.match(app,/organization:'organization'/);
  assert.match(app,/localeCompare\(String\(b\.name\|\|''\),'ko-KR'\)/);
});


test('timeline admin is seeded, permissioned and public materials use central categories',async()=>{
  const [html,app,adminHtml,adminJs,control,migration,data]=await Promise.all([
    readFile(new URL('index.html',root),'utf8'),
    readFile(new URL('app.js',root),'utf8'),
    readFile(new URL('admin/index.html',root),'utf8'),
    readFile(new URL('admin/admin.js',root),'utf8'),
    readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8'),
    readFile(new URL('../migrations/0114_seonammedi_timeline_admin.sql',import.meta.url),'utf8'),
    readFile(new URL('data.json',root),'utf8')
  ]);
  const parsed=JSON.parse(data);
  assert.match(html,/id="materialFilters"/);
  assert.match(html,/id="materialList"/);
  assert.match(app,/공식자료/);
  assert.match(app,/관련보도/);
  assert.match(app,/시민·온라인자료/);
  assert.match(app,/\/api\/seonammedi\/timeline/);
  assert.doesNotMatch(adminHtml,/data-panel-target="timeline"/);
  assert.doesNotMatch(adminHtml,/data-panel-target="content"/);
  assert.doesNotMatch(adminHtml,/data-panel-target="status"[^>]*>현재상황<\/button>/);
  assert.match(adminHtml,/data-records-admin-tab="timeline"[^>]*>활동이력<\/button>/);
  assert.match(adminHtml,/id="timelineForm"/);
  assert.match(adminJs,/\/api\/seonammedi\/admin\/timeline/);
  assert.match(control,/TIMELINE_CAP='seonammedi\.timeline\.manage'/);
  assert.match(control,/TIMELINE_SEED=/);
  assert.match(control,/async function ensureTimelineSeed\(db\)/);
  assert.match(control,/ensureTimelineSeed\(db\)[\s\S]*CREATE TABLE IF NOT EXISTS seonammedi_seed_state/);
  assert.match(control,/async function addColumnIfMissing\(db,table,column,definition\)/);
  assert.match(control,/async function ensurePublicContentSchema\(db\)/);
  assert.match(control,/SELECT '\+column\+' FROM '\+table\+' LIMIT 0/);
  assert.match(control,/SELECT id,created_by FROM seonammedi_timeline WHERE legacy_key=\?/);
  assert.doesNotMatch(control,/CREATE UNIQUE INDEX IF NOT EXISTS idx_seonammedi_timeline_legacy_key/);
  assert.match(control,/await ensureTimelineSeed\(env\.DB\)/);
  assert.match(control,/status='published'/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS seonammedi_timeline/);
  assert.match(migration,/seonammedi\.timeline\.manage/);
  assert.ok(Array.isArray(parsed.timeline)&&parsed.timeline.length>=20);
});


test('seonammedi channel renderer avoids blocked whole-page embeds and keeps iframe fallback',async()=>{
  const app=await readFile(new URL('app.js',root),'utf8');
  assert.match(app,/channelEmbedPolicy/);
  assert.match(app,/instagram:'recent-embed'/);
  assert.match(app,/facebook:'preview'/);
  assert.match(app,/tiktok:'provider-embed'/);
  assert.match(app,/youtube:'embed'/);
  assert.match(app,/channelPreviewEmbedUrl/);
  assert.match(app,/latest\?\.embedUrl\|\|data\.embedUrl/);
  assert.match(app,/setTimeout\(\(\)=>/);
  assert.match(app,/4500/);
  assert.doesNotMatch(app,/providerPreview\?\.embedUrl\|\|\(!providerPreview\?url:''\)/);
});

test('seonammedi social channel hub groups channels by platform and supports TikTok admin visibility',async()=>{
  const [html,app,adminHtml,adminJs,control]=await Promise.all([
    readFile(new URL('index.html',root),'utf8'),
    readFile(new URL('app.js',root),'utf8'),
    readFile(new URL('admin/index.html',root),'utf8'),
    readFile(new URL('admin/admin.js',root),'utf8'),
    readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8')
  ]);
  assert.match(html,/id="publicChannelAccounts"/);
  assert.match(html,/소셜 플랫폼 선택/);
  assert.match(app,/\['all','전체'\]/);
  assert.match(app,/\['facebook','Facebook'\]/);
  assert.match(app,/\['instagram','Instagram'\]/);
  assert.match(app,/\['tiktok','TikTok'\]/);
  assert.match(app,/\['youtube','YouTube'\]/);
  assert.match(app,/data-channel-platform/);
  assert.match(adminHtml,/<option value="tiktok">TikTok<\/option>/);
  assert.match(adminHtml,/사이트 표시 ON/);
  assert.match(adminJs,/toggleChannelVisibility/);
  assert.match(adminJs,/tiktok:'TikTok'/);
  assert.match(control,/PLATFORMS=new Set\(\['youtube','instagram','facebook','tiktok'/);
  assert.match(control,/player\/v1/);
  assert.match(control,/profileEmbedUrl/);
  assert.match(control,/recentItems=instagramRecentItems\(embedHtml\)/);
  assert.match(control,/videosUrl\.pathname=videosUrl\.pathname\.replace/);
  assert.match(control,/youtube-nocookie\.com\/embed/);
});

test('seonammedi civic voices are managed on the public surface without exposing contact to visitors',async()=>{
  const [control,adminHtml,voiceAdmin]=await Promise.all([
    readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8'),
    readFile(new URL('../sites/seonammedi/public/admin/index.html',import.meta.url),'utf8'),
    readFile(new URL('../sites/seonammedi/public/voice-public-admin.js',import.meta.url),'utf8')
  ]);
  assert.match(control,/VOICE_CAP='seonammedi\.voice\.manage'/);
  assert.match(control,/admin\/voices/);
  assert.match(control,/public_consent_required/);
  assert.match(control,/DELETE/);
  assert.match(adminHtml,/시민의견 운영/);
  assert.doesNotMatch(adminHtml,/id="voiceList"/);
  assert.match(adminHtml,/사용자 화면에서 관리/);
  assert.match(voiceAdmin,/field\('input','contact'/);
  assert.match(voiceAdmin,/publicConsent/);
  assert.match(voiceAdmin,/permissions\?\.voices===true/);
});

test('seonammedi citizen voice admin keeps canonical super-admin access and visible load errors',async()=>{
  const [control,adminJs]=await Promise.all([
    readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8'),
    readFile(new URL('../sites/seonammedi/public/admin/admin.js',import.meta.url),'utf8')
  ]);
  assert.match(control,/SELECT role FROM admins WHERE lower\(trim\(email\)\)=\? LIMIT 1/);
  assert.match(control,/lower\(platformAdmin\?\.role\)==='super_admin'/);
  assert.match(control,/capabilities:\['\*'\]/);
  assert.match(control,/bind\(tenant\.id,principalEmail\)\.first\(\)/);
  assert.match(adminJs,/text\(\$\('adminIdentity'\),'연결 오류'\)/);
  assert.match(adminJs,/voiceMessage\.classList\.add\('error'\)/);
  assert.match(adminJs,/관리자 정보를 불러오지 못했습니다/);
  assert.match(adminJs,/if\(Number\(error\?\.status\|\|0\)<500\)throw error/);
  assert.match(adminJs,/if\(bearer\)headers\.set\('authorization','Bearer '\+bearer\)/);
  assert.match(adminJs,/credentials:'same-origin'/);
  assert.match(adminJs,/location\.hash\.includes\('ekodi_token='\).*history\.replaceState/);
  assert.match(adminJs,/SUPABASE_URL='https:\/\/renzehysxirjilvdxacv\.supabase\.co'/);
  assert.match(adminJs,/SUPABASE_PUBLISHABLE_KEY='sb_publishable_/);
  assert.match(adminJs,/fetch\(SUPABASE_URL\+pathname/);
});


test('seonammedi admin utilities live above the left menu and content starts near the top',async()=>{
  const [html,css]=await Promise.all([
    readFile(new URL('admin/index.html',root),'utf8'),
    readFile(new URL('admin/admin.css',root),'utf8')
  ]);
  assert.match(html,/class="sidebar-tools"/);
  assert.match(html,/id="adminIdentity"/);
  assert.match(html,/class="sidebar-menu"/);
  assert.doesNotMatch(html,/class="top-actions"/);
  assert.match(css,/main\{padding:8px 18px 24px/);
  assert.match(css,/\.sidebar-tools/);
});


test('seonammedi public and admin menus keep the agreed content-first order',async()=>{
  const [html,adminHtml]=await Promise.all([readFile(new URL('index.html',root),'utf8'),readFile(new URL('admin/index.html',root),'utf8')]);
  const publicOrder=['활동이력','소통채널','시민의견','회계','공지','조직'];
  let cursor=-1;for(const label of publicOrder){const next=html.indexOf('>'+label+'</a>',cursor+1);assert.ok(next>cursor,'public menu order: '+label);cursor=next}
  assert.doesNotMatch(html,/data-view-link="records"|data-view-link="timeline"|data-view-link="materials"/);
  assert.match(html,/id="timeline"[^>]*data-view-section="status"/);
  assert.match(html,/id="materials"[^>]*data-view-section="status"/);
  assert.doesNotMatch(html,/<h2>현재상황<\/h2>|CURRENT STATUS|출처 검증형/);
  assert.match(html,/data-status-tab="news"[^>]*>관련보도<\/button>/);
  assert.match(html,/data-status-tab="official"[^>]*>공식기록<\/button>/);
  assert.match(html,/href="#timeline" data-view-link="status">활동이력<\/a>/);
  assert.match(html,/id="timeline"[^>]*class="section activity-list-only"/);
  assert.doesNotMatch(html,/id="timeline"[\s\S]*?<div class="section-head">[\s\S]*?<h2>활동이력<\/h2>/);
  assert.doesNotMatch(html,/id="timeline"[\s\S]*?id="statusTabs"/);
  assert.doesNotMatch(html,/<p class="filter-label">활동이력 세부 분류<\/p>/);
  assert.match(html,/data-status-pane="timeline"/);
  assert.match(html,/data-status-pane="materials"/);
  const adminOrder=['운영홈','내부 회의록','권한·관리자'];
  cursor=-1;for(const label of adminOrder){const next=adminHtml.indexOf('>'+label+'</button>',cursor+1);assert.ok(next>cursor,'admin menu order: '+label);cursor=next}
  for(const label of ['현재상황','소통채널','시민의견','회계','공지','조직'])assert.doesNotMatch(adminHtml,new RegExp('data-panel-target="[^"]+"[^>]*>'+label+'<\\/button>'));
  assert.doesNotMatch(adminHtml,/data-panel-target="timeline"|data-panel-target="content"/);
  assert.doesNotMatch(adminHtml,/data-ekodi-site-publication-slot|사이트 공개여부/);
  assert.match(adminHtml,/data-records-admin-tab="timeline"[^>]*>활동이력<\/button>/);
  assert.match(adminHtml,/data-records-admin-tab="review"[^>]*>자료검토<\/button>/);
});
test('seonammedi full public-menu administration covers status organization materials voices and finance',async()=>{
  const [html,app,adminHtml,adminJs,control,migration]=await Promise.all([
    readFile(new URL('index.html',root),'utf8'),
    readFile(new URL('app.js',root),'utf8'),
    readFile(new URL('admin/index.html',root),'utf8'),
    readFile(new URL('admin/admin.js',root),'utf8'),
    readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8'),
    readFile(new URL('../migrations/0116_seonammedi_full_menu_admin.sql',import.meta.url),'utf8')
  ]);
  for(const label of ['현재상황','조직','활동이력','관련보도','공식기록','공지','시민의견','회계'])assert.match(adminHtml,new RegExp(label));
  assert.match(adminHtml,/id="statusForm"/);
  assert.match(adminHtml,/id="organizationForm"/);
  assert.match(adminHtml,/data-org-admin-tab="bidae"/);
  assert.match(adminHtml,/data-org-admin-tab="mokpo"/);
  assert.match(adminHtml,/data-org-admin-tab="minhak"/);
  assert.match(adminHtml,/비대위/);
  assert.match(adminHtml,/목포대/);
  assert.match(adminHtml,/민학비대위/);
  assert.match(adminJs,/ORG_GROUPS/);
  assert.match(adminJs,/groups,levels:bidae\.levels/);
  assert.match(app,/ORG_GROUP_META/);
  assert.match(app,/renderOrganizationGroup\('bidae'\)/);
  assert.match(app,/function showStatusTab\(tab\)/);
  assert.match(app,/const canonicalViewHash=\{status:'timeline'/);
  assert.match(app,/canonicalViewHash\[key\]\|\|key/);
  assert.match(app,/renderMaterialsForStatus\?\.\(isNews\?'관련보도':'공식자료'\)/);
  assert.doesNotMatch(adminHtml,/id="financeForm"/);
  assert.match(adminHtml,/회계 관리 권한이 확인되면 공개 회계 화면/);
  assert.match(html,/id="financeManageForm"/);
  assert.match(app,/bindPublicFinanceAdmin/);
  assert.match(app,/\/api\/seonammedi\/admin\/finance/);
  assert.match(adminJs,/\/api\/seonammedi\/admin\/pages\/status/);
  assert.match(adminJs,/\/api\/seonammedi\/admin\/pages\/organization/);
  assert.match(control,/PAGE_CAP='seonammedi\.page\.manage'/);
  assert.match(control,/FINANCE_CAP='seonammedi\.finance\.manage'/);
  assert.match(control,/PREFIX\+'\/page-data'/);
  assert.match(app,/\/api\/seonammedi\/page-data/);
  assert.match(html,/id="financeList"/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS seonammedi_page_sections/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS seonammedi_finance_entries/);
  assert.match(migration,/seonammedi\.finance\.manage/);
});


// Production read-path stability fix keeps public API reads free of request-time DDL.
test('SeonamMedi Control routes defer candidate verification until Shared Site binding is active',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/control-api.worker.json',import.meta.url),'utf8'));
  const rows=manifest.worker.requests.filter(item=>String(item.url||'').includes('/api/seonammedi/'));
  const byUrl=new Map(rows.map(item=>[item.url,item]));
  for(const suffix of ['notices','channels','timeline','page-data']){
    const item=byUrl.get('https://ekodi.kr/api/seonammedi/'+suffix);
    assert.ok(item,'missing '+suffix);
    assert.equal(item.candidateVerify,false);
    assert.match(item.candidateVerifyReason,/Shared Site service binding/);
  }
});


test('seonammedi public managed reads are migration-backed and never run request-time DDL',async()=>{
  const control=await readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8');
  const body=(start,end)=>control.slice(control.indexOf(start),control.indexOf(end));
  const notices=body('async function noticePublicProjection','async function listPublicChannels');
  const channels=body('async function listPublicChannels','async function adminMe');
  const pageData=body('async function listPublicPageData','function canManagePages');
  const timeline=body('async function listPublicTimeline','async function listAdminTimeline');
  const authority=body('async function authority','function can(auth,cap)');
  for(const fn of [notices,channels,pageData,timeline,authority]){
    assert.doesNotMatch(fn,/ensureSchema\(|ensurePublicContentSchema\(|CREATE TABLE|ALTER TABLE|CREATE INDEX/);
  }
  assert.match(control,/async function publicStorageRead\(resource,read\)/);
  assert.match(control,/resource\+'_storage_read_failed'/);
  const handler=control.slice(control.indexOf('export async function handleSeonamMediAdminApi'));
  for(const resource of ['page-data','content','timeline','notices','channels'])assert.match(handler,new RegExp("publicStorageRead\\('"+resource+"'"));
  const noticeRoute=handler.slice(handler.indexOf("if(url.pathname===PREFIX+'/notices'&&request.method==='GET')"),handler.indexOf("if(url.pathname===PREFIX+'/notices'&&request.method==='POST')"));
  assert.doesNotMatch(noticeRoute,/ensurePublicContentSchema\(|ensureSchema\(|ALTER TABLE|CREATE TABLE|CREATE INDEX/);
  assert.match(notices,/PRAGMA table_info\(seonammedi_notices\)/);
  assert.match(notices,/optional\('notice_kind',"'notice'"\)/);
  assert.match(notices,/optional\('featured','0'\)/);
  const adminContent=body('async function listAdminContent','async function listAdminChannels');
  assert.match(adminContent,/ensureContentCategoryColumn\(env\.DB\)/);
});


test('seonammedi exposes seeded related channels on public and admin surfaces',async()=>{
  const [html,app,adminHtml,migration]=await Promise.all([
    readFile(new URL('index.html',root),'utf8'),
    readFile(new URL('app.js',root),'utf8'),
    readFile(new URL('admin/index.html',root),'utf8'),
    readFile(new URL('../migrations/0118_seonammedi_channel_seed.sql',import.meta.url),'utf8')
  ]);
  assert.match(html,/data-view-link="channels"/);
  assert.match(html,/id="channels"[^>]*data-view-section="channels"/);
  assert.match(html,/id="publicChannelTabs"/);
  assert.match(html,/id="channelPreview"/);
  assert.match(html,/id="channelPreviewFrame"/);
  assert.match(html,/id="channelPreviewFallback"/);
  assert.match(app,/\/api\/seonammedi\/channels/);
  assert.match(app,/\/preview/);
  assert.match(app,/channels:'channels'/);
  assert.match(app,/async function showChannelPreview\(index,\{updateRoute=true\}=\{\}\)/);
  assert.match(app,/renderChannelFallback/);
  assert.match(app,/channelRouteFromHash/);
  assert.match(app,/writeChannelRoute/);
  assert.match(app,/#channels\//);
  assert.match(app,/preferredId/);
  assert.match(app,/data-channel-index/);
  assert.match(app,/ArrowLeft/);
  assert.match(app,/renderChannelPlatformTabs/);
  assert.match(app,/showChannelPreview\(publicChannels\.indexOf\(rows\[selectedRow\]\),\{updateRoute\}\)/);
  assert.doesNotMatch(adminHtml,/data-panel-target="channels"[^>]*>소통채널<\/button>/);
  assert.match(adminHtml,/소통채널 관리/);
  assert.match(migration,/instagram\.com\/wonokoh/);
  assert.match(migration,/youtube\.com\/@Mokpo-tv/);
  assert.match(migration,/WHERE NOT EXISTS/);
  assert.match(adminHtml,/name="previewUrl"/);
  assert.match(adminHtml,/화면 내 미리보기 URL/);
});



test('seonammedi verified Instagram preview seed is additive and replaceable from admin',async()=>{
  const migration=await readFile(new URL('../migrations/0125_seonammedi_instagram_preview_seed.sql',import.meta.url),'utf8');
  assert.match(migration,/CREATE TABLE IF NOT EXISTS seonammedi_channel_previews/);
  assert.match(migration,/instagram\.com\/wonokoh\/p\/Dd8q1vCSlhT\//);
  assert.match(migration,/ON CONFLICT\(channel_id\) DO UPDATE SET/);
  assert.doesNotMatch(migration,/DROP TABLE|DELETE FROM|ALTER TABLE .* RENAME/);
});

test('seonammedi channel previews use provider-safe embeds and same-origin metadata fallback',async()=>{
  const [control,app]=await Promise.all([
    readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8'),
    readFile(new URL('app.js',root),'utf8')
  ]);
  assert.match(control,/channelPreviewMatch=url\.pathname\.match/);
  assert.ok(control.includes("instagram.com/'+encodeURIComponent(handle)+'/embed/"));
  assert.match(control,/instagramRecentItems/);
  assert.match(control,/profileEmbedUrl/);
  assert.match(control,/let recentItems=instagramRecentItems\(html\)/);
  assert.match(control,/recentItems=instagramRecentItems\(embedHtml\)/);
  assert.match(control,/preview\.recentItems=\[\.\.\.\(preview\.recentItems\|\|\[\]\),\.\.\.recentItems\.filter/);
  assert.match(control,/preview\.contentType='recent-posts'/);
  assert.match(control,/preview\.embedUrl=provider\.profileEmbedUrl/);
  assert.match(control,/preview\.contentType='profile'/);
  assert.match(control,/youtube-nocookie\.com\/embed\//);
  assert.match(control,/"videoId":"\(\[A-Za-z0-9_-\]\{11\}\)"/);
  assert.match(control,/preview\.contentType='latest-video'/);
  assert.match(control,/itemprop=\["'\]channelId\["'\]/);
  assert.match(control,/browseId/);
  assert.match(control,/feeds\/videos\.xml\?channel_id=/);
  assert.match(control,/provider\.kind!=='youtube'/);
  assert.match(control,/function explicitChannelEmbed\(item\)/);
  assert.match(control,/item\.platform==='instagram'/);
  assert.match(control,/findIndex\(part=>\['p','reel'\]\.includes\(part\)\)/);
  assert.match(control,/const shortcode=kindIndex>=0\?parts\[kindIndex\+1\]/);
  assert.match(control,/preview\.contentType='explicit-preview'/);
  assert.match(control,/preview_url/);
  assert.match(control,/CHANNEL_BROWSER_UA/);
  assert.match(app,/channelPreviewSeq/);
  assert.match(app,/recentItems/);
  assert.match(app,/channelPreviewEmbedUrl/);
  assert.match(app,/최근 공개 콘텐츠/);
  assert.match(app,/frame\.src='about:blank'/);
});

test('seonammedi channel preview exposes up to three recent items for YouTube and social channels',async()=>{
  const [app,html,css,control]=await Promise.all([
    readFile(new URL('app.js',root),'utf8'),
    readFile(new URL('index.html',root),'utf8'),
    readFile(new URL('app.css',root),'utf8'),
    readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8')
  ]);
  assert.match(html,/id="channelPreviewRecent"/);
  assert.match(app,/function renderChannelRecent\(item,data=\{\}\)/);
  assert.match(app,/slice\(0,3\)/);
  assert.match(app,/data-channel-recent-index/);
  assert.match(css,/\.channel-recent-grid\{display:grid;grid-template-columns:repeat\(3/);
  assert.match(control,/function youtubeRecentItems\(xml\)/);
  assert.match(control,/items\.length<3/);
  assert.match(control,/resolveYouTubeChannelId/);
  assert.match(control,/social\/api\/media\/youtube\/status\?handle=/);
  assert.match(control,/contentType='recent-videos'/);
});


test('seonammedi admin auth handoff is same-origin and finance API is production-guarded',async()=>{
  const [control,adminJs,manifestText]=await Promise.all([
    readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8'),
    readFile(new URL('admin/admin.js',root),'utf8'),
    readFile(new URL('../deploy/manifests/control-api.worker.json',import.meta.url),'utf8')
  ]);
  assert.match(control,/AUTH_EXCHANGE_PATH=PREFIX\+'\/admin\/auth\/exchange'/);
  assert.match(control,/AUTH_REFRESH_PATH=PREFIX\+'\/admin\/auth\/refresh'/);
  assert.match(control,/MY_SUPABASE_URL/);
  assert.match(control,/MY_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(control,/auth_upstream_unavailable/);
  assert.match(adminJs,/\/api\/seonammedi\/admin\/auth\/exchange/);
  assert.match(adminJs,/\/api\/seonammedi\/admin\/auth\/refresh/);
  assert.match(adminJs,/fetch\(SUPABASE_URL\+pathname/);
  const manifest=JSON.parse(manifestText);
  const byUrl=new Map(manifest.worker.requests.map(item=>[item.url,item]));
  const exchange=byUrl.get('https://ekodi.kr/api/seonammedi/admin/auth/exchange');
  assert.ok(exchange);
  assert.equal(exchange.method,'POST');
  assert.deepEqual(exchange.statuses,[400]);
  assert.ok(exchange.expect.includes('token_hash_required'));
  assert.equal(exchange.candidateVerify,false);
  const finance=byUrl.get('https://ekodi.kr/api/seonammedi/admin/finance');
  assert.ok(finance);
  assert.deepEqual(finance.statuses,[401]);
  assert.ok(finance.expect.includes('authentication_required'));
  assert.equal(finance.candidateVerify,false);
});


test('seonammedi site admin delegates automatic checks to the platform super admin',async()=>{
  const adminHtml=await readFile(new URL('admin/index.html',root),'utf8');
  assert.doesNotMatch(adminHtml,/data-panel-target="site-health"|>사이트 점검<|>정적 상태<|>동적 상태/);
});

test('seonammedi monitor D1 insert keeps column and value arity aligned',async()=>{
  const monitor=await readFile(new URL('../seonammedi-monitor.js',import.meta.url),'utf8');
  assert.match(monitor,/INSERT INTO seonammedi_monitor_items \(fingerprint,title,url,publisher,published_at,query_key,query_label,review_state,first_seen_at,last_seen_at,resolved_url,media_type,media_url,media_source,media_published_at,media_state,source_type,summary_text\) VALUES \(\?,\?,\?,\?,\?,\?,\?,'source_only',\?,\?,\?,\?,\?,\?,\?,\?,\?,\?\)/);
});



test('seonammedi notices are an authenticated public board with image and sharing support',async()=>{
  const [control,html,app,css,auth,migration,apiConfig]=await Promise.all([
    readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8'),readFile(new URL('index.html',root),'utf8'),readFile(new URL('app.js',root),'utf8'),
    readFile(new URL('app.css',root),'utf8'),readFile(new URL('../auth-site/auth.js',import.meta.url),'utf8'),readFile(new URL('../migrations/0122_seonammedi_public_notice_board.sql',import.meta.url),'utf8'),readFile(new URL('../wrangler.api.toml',import.meta.url),'utf8')
  ]);
  assert.match(control,/createPublicNotice/);assert.match(control,/principalFromSupabaseRequest\(request\)/);
  assert.match(control,/image_too_large/);assert.match(control,/storeNoticeImageInDrive/);assert.match(control,/binding = "STORAGE"|STORAGE/);assert.match(control,/noticeImageMatch/);
  assert.match(html,/id="noticeComposeForm"/);assert.match(html,/id="homeSpotlight"/);assert.match(html,/사진과 글을 게시/);
  assert.match(app,/navigator\.share/);assert.match(app,/noticePermalink/);assert.match(app,/FormData\(noticeCompose\)/);assert.match(app,/NOTICE_SESSION_KEY/);
  assert.match(app,/recent=\[\.\.\.rows\]\.sort/);assert.match(css,/\.home-spotlight/);assert.match(css,/\.notice-detail/);
  assert.match(auth,/target\.pathname==='\/seonammedi'/);assert.match(migration,/image_key/);assert.match(apiConfig,/binding = "LIVE_RECORDINGS_BUCKET"/);
});


test('current status exposes non-overlapping immediate subcategory tabs',async()=>{
  const [html,app]=await Promise.all([
    readFile(new URL('index.html',root),'utf8'),
    readFile(new URL('app.js',root),'utf8')
  ]);
  assert.match(html,/활동이력 세부 분류/);
  assert.match(html,/id="statusMaterialFilterLabel">관련보도 세부 분류/);
  assert.match(html,/id="materialFilters" aria-label="관련보도 세부 분류"/);
  assert.doesNotMatch(html,/id="materialFilters"[^>]*hidden/);
  for(const label of ['일반보도','경과·일지','현장·행사 보도','해설·분석','정부·지자체·국회','대학','비대위·당사자','기타 공식기록'])assert.match(app,new RegExp(label));
  assert.match(app,/item\.detailCategory=item\.category==='공식자료'\?officialDetailCategory\(item\):item\.category==='관련보도'\?newsDetailCategory\(item\)/);
  assert.match(app,/renderMaterialsForStatus=topCategory=>\{renderMaterialFilters\(topCategory\);renderMaterials\(topCategory,'전체'\)\}/);
});

// ops: retrigger guarded Control API deployment after Instagram profile-embed promotion (r2)


test('seonammedi notice permalink is served by the site shell',async()=>{
  const env={ENVIRONMENT:'production',ASSETS:{fetch:async request=>new Response(new URL(request.url).pathname,{status:200,headers:{'content-type':'text/html; charset=utf-8'}})}};
  const response=await platformRouter.fetch(new Request('https://ekodi.kr/seonammedi/notices/2'),env,{});
  assert.equal(response.status,200);
  assert.equal(await response.text(),'/seonammedi/');
  const app=await readFile(new URL('app.js',root),'utf8');
  assert.match(app,/pathname\.match\(\/\^\(\?:\\\/seonammedi\)\?\\\/notices/);
  assert.match(app,/find\(item=>Number\(item\.id\)===wanted\)/);
});



test('seonammedi public site uses shared authenticated inline admin without duplicate citizen-voice CRUD',async()=>{
  const [html,app,voiceAdmin,css,adminHtml,adminJs,control,shared]=await Promise.all([
    readFile(new URL('index.html',root),'utf8'),
    readFile(new URL('app.js',root),'utf8'),
    readFile(new URL('voice-public-admin.js',root),'utf8'),
    readFile(new URL('app.css',root),'utf8'),
    readFile(new URL('admin/index.html',root),'utf8'),
    readFile(new URL('admin/admin.js',root),'utf8'),
    readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8'),
    readFile(new URL('../shell/public-surface-admin.js',import.meta.url),'utf8')
  ]);
  assert.match(app,/initPublicAdminControls/);
  assert.match(app,/window\.EKODIPublicSurfaceAdmin/);
  assert.match(app,/serviceId:'seonammedi'/);
  assert.match(app,/adminPath:window\.__SEONAMMEDI_ROUTES__\?\.admin\|\|'\/seonammedi\/admin\/'/);
  assert.match(app,/authEndpoint:'\/api\/seonammedi\/admin\/me'/);
  assert.match(app,/await admin\.authorize\(\)/);
  assert.doesNotMatch(app,/admin\.attach/);
  for(const label of ['조직 바로 수정','활동이력 바로 수정','소통채널 바로 수정'])assert.match(html,new RegExp(label));
  assert.match(app,/공지 바로 수정/);
  assert.match(app,/bindPublicFinanceAdmin/);
  assert.match(app,/if\(admin\.has\('notices'\)\).*loadNotices\(\)/);
  assert.match(app,/seonammedi:voice-inline-admin-authorized/);
  assert.match(html,/voice-public-admin\.js/);
  assert.match(voiceAdmin,/window\.EKODIPublicSurfaceAdmin/);
  assert.match(voiceAdmin,/permissions\?\.voices===true/);
  assert.match(voiceAdmin,/\/board\/api\/admin\/posts/);
  assert.match(voiceAdmin,/data-seonammedi-voice-admin/);
  assert.match(voiceAdmin,/voice-inline-admin-delete/);
  assert.match(css,/\.voice-inline-admin/);
  assert.doesNotMatch(adminHtml,/id="voiceEditForm"/);
  assert.match(adminHtml,/사용자 화면에서 관리/);
  assert.doesNotMatch(adminJs,/function editVoice\(item\)|function renderVoices\(\)/);
  assert.match(adminJs,/async function loadVoices\(\)/);assert.match(adminJs,/\/board\/api\/admin\/posts/);
  assert.match(shared,/window\.EKODIPublicSurfaceAdmin/);
  assert.match(shared,/permissions\[key\]===true/);
  assert.match(control,/VOICE_CATEGORIES/);
  assert.match(control,/UPDATE seonammedi_civic_voices SET category=\?,display_name=\?,contact=\?,message=\?,review_status=\?/);
  assert.match(control,/public_consent_required/);
});

test('seonammedi notice detail lets the author edit and delete the clicked post',async()=>{
  const [app,control]=await Promise.all([readFile(new URL('app.js',root),'utf8'),readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8')]);
  assert.match(app,/noticeOwnedByCurrentUser/);
  assert.match(app,/class="notice-edit">수정<\/button>/);
  assert.match(app,/class="notice-delete">삭제<\/button>/);
  assert.match(app,/beginNoticeEdit/);
  assert.ok(app.includes("method=editingId?'PUT':'POST'"));
  assert.match(app,/keepImageIndexes/);
  assert.match(app,/data-remove-existing-image/);
  assert.match(control,/async function updatePublicNotice\(request,env,id\)/);
  assert.match(control,/edit_forbidden/);
  assert.match(control,/request\.method==='PUT'/);
  assert.match(control,/UPDATE seonammedi_notices SET title=\?,body=\?,image_key=\?,image_type=\?,image_keys_json=\?,image_types_json=\?,updated_at=\?/);
});


test('seonammedi activity history always renders in descending date order across every filter',async()=>{
  const app=await readFile(new URL('app.js',root),'utf8');
  assert.match(app,/const timelineDateKey=value=>/);
  assert.match(app,/const timelineDescending=\(a,b\)=>timelineDateKey\(b\.date\)-timelineDateKey\(a\.date\)/);
  assert.match(app,/\(activeTimelineCategory==='전체'\?publicTimelineEntries:publicTimelineEntries\.filter\([^;]+\)\)\.slice\(\)\.sort\(timelineDescending\)/);
});

// descending activity-history order is enforced for every public category filter


test('seonammedi notice list exposes edit and delete actions for the signed-in author',async()=>{
  const [app,css]=await Promise.all([
    readFile(new URL('app.js',root),'utf8'),
    readFile(new URL('app.css',root),'utf8')
  ]);
  assert.match(app,/data-notice-edit/);
  assert.match(app,/data-notice-delete/);
  assert.match(app,/async function deleteNotice\(item\)/);
  assert.match(app,/querySelectorAll\('\[data-notice-edit\]'\)/);
  assert.match(app,/querySelectorAll\('\[data-notice-delete\]'\)/);
  assert.match(css,/\.notice-row-actions/);
});


test('seonammedi notice composer places attachments before body, compresses to 5MB, and renders images inline',async()=>{
  const [html,app,control]=await Promise.all([
    readFile(new URL('index.html',root),'utf8'),
    readFile(new URL('app.js',root),'utf8'),
    readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8')
  ]);
  assert.ok(html.indexOf('id="noticeImages"')<html.indexOf('name="body"'));
  assert.match(html,/장당 5MB 이하로 자동 최적화/);
  assert.match(app,/NOTICE_IMAGE_MAX_BYTES=5\*1024\*1024/);
  assert.match(app,/async function compressNoticeImage\(file\)/);
  assert.match(app,/canvas\.toBlob\(resolve,'image\/webp',quality\)/);
  assert.match(app,/notice-detail-body/);
  assert.match(app,/첨부 사진을 본문에 함께 표시합니다/);
  assert.match(control,/image\.size\|\|0\)>5\*1024\*1024/);
});


test('seonammedi notice list actions use server-authorized canManage without exposing author email',async()=>{
  const [app,control]=await Promise.all([
    readFile(new URL('app.js',root),'utf8'),
    readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8')
  ]);
  assert.match(app,/function noticeOwnedByCurrentUser\(item\)\{return Boolean\(noticeToken\(\)&&item\?\.canManage\)\}/);
  assert.match(app,/fetch\('\/api\/seonammedi\/notices',\{cache:'no-store',headers:token\?\{authorization:'Bearer '\+token\}:\{\}\}\)/);
  assert.match(control,/async function listPublicNotices\(request,env\)/);
  assert.match(control,/canManage:Boolean\(admin\)\|\|Boolean\(email&&lower\(row\.created_by\)===email\)/);
  assert.doesNotMatch(control,/eventEnd:row\.event_end\|\|'',createdBy:row\.created_by\|\|''/);
});


test('seonammedi notice image storage stays public-surface managed while admin duplicate editor is removed',async()=>{
  const [control,app,adminHtml]=await Promise.all([
    readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8'),
    readFile(new URL('app.js',root),'utf8'),
    readFile(new URL('admin/index.html',root),'utf8')
  ]);
  assert.match(control,/async function storeNoticeImage\(env,image,principal\)/);
  assert.match(control,/storeNoticeImageInDrive\(env,image,\{email:principal\?\.email\|\|''\}\)/);
  assert.match(control,/form\.getAll\('images'\)/);
  assert.match(control,/if\(images\.length>5\)/);
  assert.match(control,/image_keys_json/);
  assert.match(control,/storeNoticeImage\(env,image,auth\)/);
  assert.match(app,/NOTICE_IMAGE_MAX_BYTES=5\*1024\*1024/);
  assert.match(app,/compressNoticeImage/);
  assert.match(app,/form\.append\('images',file,file\.name\)/);
  assert.doesNotMatch(adminHtml,/id="adminNoticeImages"|id="noticeForm"/);
  assert.match(adminHtml,/공지 작성·수정·삭제는 실제 사용자 화면/);
});


test('seonammedi public reply path never performs request-time schema DDL',async()=>{
  const civic=await readFile(new URL('../seonammedi-civic-control.js',import.meta.url),'utf8');
  const start=civic.indexOf('async function createPublicReply');
  const end=civic.indexOf('function originAllowed',start);
  assert.ok(start>=0&&end>start);
  const block=civic.slice(start,end);
  assert.doesNotMatch(block,/ensureSchema|CREATE TABLE|ALTER TABLE|CREATE INDEX/);
});


test('seonammedi citizen opinions hand off to the standalone board-owned UI',async()=>{
  const [html,worker,config]=await Promise.all([
    readFile(new URL('index.html',root),'utf8'),
    readFile(new URL('../services/independent-board/worker.js',import.meta.url),'utf8'),
    readFile(new URL('../wrangler.independent-board.toml',import.meta.url),'utf8')
  ]);
  assert.match(html,/href="board\/voices"[^>]*>시민의견<\/a>/);
  assert.doesNotMatch(html,/id="voices"|id="publicVoiceList"|id="voiceComposeToggle"/);
  assert.match(worker,/function boardPage\(req\)/);
  assert.match(worker,/env\.BOARD_DB/);
  assert.match(worker,/의견 등록/);
  assert.match(worker,/답글 등록/);
  assert.match(worker,/\/api\/admin\/posts/);
  assert.match(worker,/adminLogin\.hidden=false;await load\(\)/);
  const authEntry=await readFile(new URL('../auth-site/auth-entry.js',import.meta.url),'utf8');
  assert.match(authEntry,/purpose'\) === 'seonammedi-board-admin'/);
  assert.match(config,/database_name = "ekodi-independent-board"/);
});

test('seonammedi mobile activity history uses compact filters, progressive detail, and inline admin control',async()=>{const [html,app,css]=await Promise.all([readFile(new URL('index.html',root),'utf8'),readFile(new URL('app.js',root),'utf8'),readFile(new URL('app.css',root),'utf8')]);assert.match(html,/id="timelineManageToggle"/);assert.match(html,/id="timelineManageForm"/);assert.match(app,/timeline-toggle/);assert.match(app,/is-collapsed/);assert.match(app,/bindPublicTimelineAdmin/);assert.match(css,/activity-toolbar \.filters\{flex-wrap:nowrap;overflow-x:auto/);assert.match(css,/\.timeline-item\.is-collapsed \.timeline-detail\{display:none\}/);assert.match(css,/\.inline-manage-grid\{grid-template-columns:1fr\}/);});


test('seonammedi voices finance and notices use sibling standalone board routes',async()=>{
  const [html,worker]=await Promise.all([
    readFile(new URL('index.html',root),'utf8'),
    readFile(new URL('../services/independent-board/worker.js',import.meta.url),'utf8')
  ]);
  assert.match(html,/href="board\/voices"[^>]*>시민의견<\/a>/);
  assert.match(html,/href="board\/finance"[^>]*>회계<\/a>/);
  assert.match(html,/href="board\/notices"[^>]*>공지<\/a>/);
  assert.match(worker,/boardPath\(req,'voices'\)/);
  assert.match(worker,/boardPath\(req,'finance'\)/);
  assert.match(worker,/boardPath\(req,'notices'\)/);
  assert.match(worker,/function financePage\(req\)/);
  assert.match(worker,/function noticesPage\(req\)/);
  assert.match(worker,/sitePath\(req,'\/#organization'\)/);
});


test('seonammedi registered Google admins manage public content from user surfaces while standalone admin stays essential-only',async()=>{
  const [app,adminHtml,adminJs,worker]=await Promise.all([
    readFile(new URL('app.js',root),'utf8'),
    readFile(new URL('admin/index.html',root),'utf8'),
    readFile(new URL('admin/admin.js',root),'utf8'),
    readFile(new URL('../services/independent-board/worker.js',import.meta.url),'utf8')
  ]);
  assert.match(app,/공지 바로 수정/);
  assert.match(app,/조직 바로 수정/);
  assert.match(app,/bindPublicTimelineAdmin/);
  assert.match(app,/bindPublicChannelAdmin/);
  assert.match(app,/회계 바로 수정/);
  assert.doesNotMatch(app,/admin\.open\('status','활동이력 관리'\)/);
  assert.doesNotMatch(app,/admin\.attach\(el\('channels'\)/);
  assert.match(worker,/auth\.permissions\?\.\[permission\]===true/);
  const [control,accessApi]=await Promise.all([
    readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8'),
    readFile(new URL('../supabase/functions/access-api/index.ts',import.meta.url),'utf8')
  ]);
  assert.match(accessApi,/path==="\/platform-authority"/);
  assert.match(accessApi,/platformAdmin:await platformAdmin\(auth\.user\.id\)/);
  assert.match(control,/async function centralPlatformAuthority\(request\)/);
  assert.match(control,/PLATFORM_AUTHORITY_URL/);
  assert.match(control,/if\(await centralPlatformAuthority\(request\)\)return \{ok:true,email:principalEmail,role:'super_admin',platform:true,capabilities:\['\*'\]\}/);
  assert.match(worker,/data-edit/);
  assert.match(worker,/data-delete/);
  assert.match(worker,/data-reply-delete/);
  assert.match(worker,/\/api\/admin\/posts/);
  assert.match(adminHtml,/data-panel-target="minutes"[^>]*>내부 회의록<\/button>/);
  assert.match(adminHtml,/data-panel-target="access"[^>]*>권한·관리자<\/button>/);
  for(const label of ['현재상황','소통채널','시민의견','회계','공지','조직'])assert.doesNotMatch(adminHtml,new RegExp('data-panel-target="[^"]+"[^>]*>'+label+'<\\/button>'));
  assert.match(adminJs,/navVisibility/);
});



test('seonammedi organization editing is inline on the public user surface',async()=>{
  const html=await readFile(new URL('index.html',root),'utf8');
  const app=await readFile(new URL('app.js',root),'utf8');
  assert.match(html,/id="organizationManageToggle"/);
  assert.match(html,/id="organizationManageForm"/);
  assert.match(html,/name="representatives"/);
  assert.match(html,/name="committees"/);
  assert.match(html,/name="participants"/);
  assert.match(app,/function bindPublicOrganizationAdmin\(\)/);
  assert.match(app,/\/api\/seonammedi\/admin\/pages\/organization/);
  assert.match(app,/if\(admin\.has\('pages'\)\)bindPublicOrganizationAdmin\(\)/);
  assert.doesNotMatch(app,/admin\.attach\(el\('organization'\)/);
});


test('seonammedi customer-domain navigation stays on seonammedi.kr instead of My EKODI',async()=>{
  const [html,app,adminHtml,minutes,css]=await Promise.all([readFile(new URL('index.html',root),'utf8'),readFile(new URL('app.js',root),'utf8'),readFile(new URL('admin/index.html',root),'utf8'),readFile(new URL('admin/admin-minutes.js',root),'utf8'),readFile(new URL('app.css',root),'utf8')]);
  assert.match(html,/<link rel="canonical" href="https:\/\/seonammedi\.kr\/">/);
  assert.match(html,/<a class="brand" href="\.\/">/);
  assert.match(html,/<a href="admin\/">관리<\/a>/);
  assert.match(html,/<div class="site-footer-copy">\s*<strong>서남권 국립의대 소통센터<\/strong>\s*<span>자료의 성격과 출처를 구분해 보존합니다.<\/span>\s*<\/div>/);
  assert.ok(!html.includes('id="lastUpdated"'));
  assert.match(html,/id="homeLatestUpdatedAt"/);
  assert.ok(app.includes("'마지막 갱신 '+new Date(runAt).toLocaleString"));
  assert.ok(app.includes("+' · EKODI 자동갱신'"));
  assert.ok(!app.includes("latest.textContent='마지막 갱신 '"));
  assert.match(css,/\.site-footer-copy\{display:grid;gap:2px/);
  assert.match(css,/footer>a\{flex:0 0 auto;margin-left:auto/);
  for(const hash of ['timeline','channels','organization'])assert.match(adminHtml,new RegExp('href="\.\.\/#'+hash+'"'));
  assert.match(adminHtml,/href="\.\.\/board\/voices">시민의견 관리/);
  assert.match(adminHtml,/href="\.\.\/board\/finance">회계 관리/);
  assert.match(adminHtml,/href="\.\.\/board\/notices">공지 관리/);
  assert.match(app,/\^\(\?:\\\/seonammedi\)\?\\\/notices/);
  assert.ok(minutes.includes("location.origin+'/minutes/?token='"));
  assert.match(css,/min-height:100dvh;display:flex;flex-direction:column/);
  assert.match(css,/footer{margin-top:auto/);
  assert.match(html,/href="board\/finance">회계<\/a>/);
  assert.match(app,/financeLink=event\.target\.closest\('a\[href="board\/finance"\]\'\)/);
  assert.match(html,/ACTIVITY HISTORY<\/p><h2>활동이력<\/h2>/);
  assert.match(html,/세부 메뉴 준비중/);
  assert.doesNotMatch(app,/raw==='finance'.*location\.replace\('\/finance\/'\)/);
  assert.match(css,/scroll-margin-top:84px/);
  assert.match(css,/@media\(max-width:760px\)\{\.section\{scroll-margin-top:118px\}/);
  assert.match(css,/\.finance-preparing-section \.finance-detail-content\{display:none!important\}/);
  assert.match(css,/\.hero\{padding:48px 20px 26px\}/);
  assert.match(css,/\.section\{padding:44px 20px 28px;border-top:1px solid #dce3ea\}/);
  assert.match(css,/@media\(max-width:760px\).*\.section\{padding-top:36px\}/);
});


test('seonammedi customer domain cache-busts public and admin static assets',async()=>{
  const [html,adminHtml]=await Promise.all([readFile(new URL('index.html',root),'utf8'),readFile(new URL('admin/index.html',root),'utf8')]);
  assert.ok(html.includes('/seonammedi/app.css?v=20261006-domain-routing-2'));
  assert.ok(html.includes('/seonammedi/app.js?v=20261006-domain-routing-2'));
  assert.ok(adminHtml.includes('<a class="brand" href="./">'));
  assert.ok(adminHtml.includes('<a href="../" target="_blank" rel="noopener">공개페이지</a>'));
  assert.ok(adminHtml.includes('/seonammedi/admin/admin.js?v=20261006-domain-routing-2'));
  assert.ok(adminHtml.includes('/seonammedi/admin/admin-minutes.js?v=20261006-domain-routing-2'));
});


test('seonammedi release convergence is build-owned and cache-safe',async()=>{
  const [build,release,verify,router,app]=await Promise.all([
    readFile(new URL('../scripts/build.mjs',import.meta.url),'utf8'),
    readFile(new URL('../scripts/finalize-seonammedi-release.mjs',import.meta.url),'utf8'),
    readFile(new URL('../scripts/verify-seonammedi-release-live.mjs',import.meta.url),'utf8'),
    readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8'),
    readFile(new URL('app.js',root),'utf8')
  ]);
  assert.match(build,/finalizeSeonamMediRelease/);
  assert.match(release,/\.well-known\/ekodi-release\.json/);
  assert.match(release,/createHash\('sha256'\)/);
  assert.match(release,/data-ekodi-release-convergence/);
  assert.match(release,/window\.__SEONAMMEDI_ROUTES__/);
  assert.match(verify,/root_cache_policy_/);
  assert.match(verify,/admin_cache_policy_/);
  assert.match(verify,/public.*max-age=0/);
  assert.match(verify,/admin_robots_policy_/);
  assert.match(router,/function applySeonamMediCachePolicy\(/);
  assert.match(router,/privatePath=.*admin\|minutes\|auth\|board/);
  assert.match(router,/if\(privatePath\)\{out\.headers\.set\('cache-control','no-store'\)/);
  assert.match(router,/x-robots-tag','noindex, nofollow, noarchive'/);
  assert.match(router,/type\.includes\('text\/html'\).*public, max-age=0/);
  assert.match(router,/max-age=31536000, immutable/);
  assert.match(router,/no-cache, must-revalidate/);
  assert.match(app,/window\.__SEONAMMEDI_ROUTES__\?\.admin/);
});


test('seonammedi static surfaces declare route parity contract and preserve mount-aware links',async()=>{
  const [html,adminHtml,adminJs]=await Promise.all([
    readFile(new URL('index.html',root),'utf8'),
    readFile(new URL('admin/index.html',root),'utf8'),
    readFile(new URL('admin/admin.js',root),'utf8')
  ]);
  for(const source of [html,adminHtml]){
    assert.match(source,/name="ekodi-route-contract" content="CANONICAL-PATH-MOUNT-PARITY-001 CANONICAL-ROUTE-SLASH-PARITY-001"/);
  }
  for(const route of ['voices','finance','notices'])assert.match(html,new RegExp('href="board/'+route+'"'));
  assert.match(html,/href="admin\/">관리<\/a>/);
  for(const route of ['voices','finance','notices'])assert.match(adminHtml,new RegExp('href="\.\.\/board/'+route+'"'));
  assert.match(adminJs,/searchParams\.set\('site','seonammedi'\)/);
  assert.doesNotMatch(adminJs,/searchParams\.set\('site','portal'\)/);
});


test('seonammedi auth bridge falls back to the registered Supabase public endpoint when route env vars are absent',async()=>{
  const mod=await import(new URL('../seonammedi-admin-control.js?auth-fallback='+Date.now(),import.meta.url));
  const original=globalThis.fetch;
  let called='';
  globalThis.fetch=async (url,options={})=>{
    called=String(url);
    assert.equal(options.method,'POST');
    return new Response(JSON.stringify({access_token:'session-token',refresh_token:'refresh-token',expires_at:9999999999,user:{id:'u1',email:'admin@example.com'}}),{status:200,headers:{'content-type':'application/json'}});
  };
  try{
    const response=await mod.handleSeonamMediAdminApi(new Request('https://seonammedi.kr/api/seonammedi/admin/auth/exchange',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token_hash:'handoff-token',type:'email'})}),{});
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(data.access_token,'session-token');
    assert.match(called,/^https:\/\/renzehysxirjilvdxacv\.supabase\.co\/auth\/v1\/verify$/);
  }finally{globalThis.fetch=original}
});


test('seonammedi auth bridge changes automatically route through guarded Control production release',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/redeploy-control-on-central-core.yml',import.meta.url),'utf8');
  assert.match(workflow,/seonammedi-admin-control\.js/);
  assert.match(workflow,/gh workflow run deploy-control-api\.yml --ref main/);
  assert.match(workflow,/release_branch_ref/);
  assert.match(workflow,/release_task_id/);
});


test('seonammedi timeline and channels are managed inline on the public user surface',async()=>{
  const [html,app,css]=await Promise.all([
    readFile(new URL('index.html',root),'utf8'),
    readFile(new URL('app.js',root),'utf8'),
    readFile(new URL('app.css',root),'utf8')
  ]);
  for(const id of ['timelineManageToggle','timelineManageForm','channelManageToggle','channelManageForm','channelManageList'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(app,/function bindPublicTimelineAdmin\(\)/);
  assert.match(app,/\/api\/seonammedi\/admin\/timeline/);
  assert.match(app,/data-timeline-edit/);
  assert.match(app,/data-timeline-status/);
  assert.match(app,/data-timeline-delete/);
  assert.match(app,/function bindPublicChannelAdmin\(\)/);
  assert.match(app,/\/api\/seonammedi\/admin\/channels/);
  assert.match(app,/data-channel-edit/);
  assert.match(app,/data-channel-visible/);
  assert.match(app,/data-channel-delete/);
  assert.match(app,/if\(admin\.has\('timeline'\)\)bindPublicTimelineAdmin\(\)/);
  assert.match(app,/if\(admin\.has\('channels'\)\)bindPublicChannelAdmin\(\)/);
  assert.doesNotMatch(app,/timelineAdminEdit/);
  assert.doesNotMatch(app,/admin\.open\('status','활동이력 관리'\)/);
  assert.doesNotMatch(app,/admin\.attach\(el\('channels'\)/);
  assert.match(css,/\.inline-manage-form/);
  assert.match(css,/\.inline-manage-list/);
});
