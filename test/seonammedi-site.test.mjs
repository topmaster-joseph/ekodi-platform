import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import platformRouter from '../platform-router-entry-worker.js';
const root=new URL('../sites/seonammedi/public/',import.meta.url);
test('seonammedi notice login uses central EKODI auth and preserves customer-domain return',async()=>{const [app,auth,policy]=await Promise.all([readFile(new URL('app.js',root),'utf8'),readFile(new URL('../auth-site/auth.js',import.meta.url),'utf8'),readFile(new URL('../config/site-execution-enforcement.json',import.meta.url),'utf8')]);assert.match(app,/new URL\('https:\/\/ekodi\.kr\/auth\/'\)/);assert.doesNotMatch(app,/new URL\('\/auth\/',location\.origin\)/);assert.match(app,/return_to',location\.origin\+'\/seonammedi\/\?compose=notice#notices'/);assert.match(auth,/https:\/\/seonammedi\.kr/);assert.match(auth,/서남권국립의대\.kr/);const parsed=JSON.parse(policy);assert.equal(parsed.authenticationEntry?.status,'enforced');assert.equal(parsed.authenticationEntry?.siteLocalAuthPathForbidden,true);assert.equal(parsed.authenticationEntry?.perSiteOptOutAllowed,false);});


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

test('seonammedi civic channel keeps source attribution, media evidence and privacy boundaries',async()=>{const [html,data,app]=await Promise.all([readFile(new URL('index.html',root),'utf8'),readFile(new URL('data.json',root),'utf8'),readFile(new URL('app.js',root),'utf8')]);assert.match(html,/사실은 출처와 함께/);assert.match(html,/<h2>회계<\/h2>/);assert.match(html,/개인정보/);assert.match(html,/원출처 링크/);const parsed=JSON.parse(data);assert.ok(parsed.timeline.length>=10);assert.ok(parsed.sources.every(s=>s.publisher&&s.url));assert.equal(parsed.finance.raised,null);assert.equal(parsed.mediaPolicy.mode,'source-link-first');for(const row of parsed.timeline){assert.ok(Array.isArray(row.links));assert.ok(Array.isArray(row.media));for(const media of row.media){assert.ok(['photo','video'].includes(media.type));assert.match(media.url,/^https:\/\//);assert.ok(media.source)}}assert.ok(parsed.timeline.some(row=>row.media.some(media=>media.type==='photo')));assert.match(app,/mediaLabel/);assert.match(app,/safeUrl/);});

test('canonical path, assets and feedback API use seonammedi',async()=>{const [html,app,build,router,wrangler]=await Promise.all([readFile(new URL('index.html',root),'utf8'),readFile(new URL('app.js',root),'utf8'),readFile(new URL('../scripts/build.mjs',import.meta.url),'utf8'),readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8'),readFile(new URL('../wrangler.site.toml',import.meta.url),'utf8')]);assert.match(html,/https:\/\/ekodi\.kr\/seonammedi\//);assert.match(html,/\/seonammedi\/app\.css/);assert.match(app,/\/api\/seonammedi\/voices/);assert.match(build,/sites\/seonammedi\/public/);assert.match(router,/SEONAMMEDI_PREFIX='\/seonammedi'/);assert.match(router,/DELETED_SEONAM_PREFIXES/);const workerFirst=(wrangler.match(/run_worker_first = \[(.*?)\]/s)?.[1].match(/\"[^\"]+\"/g)||[]);assert.ok(workerFirst.length<=100);assert.doesNotMatch(wrangler,/\"\/seonammedi\\\*\"/);assert.doesNotMatch(wrangler,/\"\/seonam-med\\\*\"/);assert.doesNotMatch(wrangler,/crons\s*=/);assert.doesNotMatch(html,/사이트 일일점검|monitorBadge|id="monitor"/);assert.match(app,/\/api\/seonammedi\/monitor/);});

test('seonammedi civic canonical D1 table is provisioned by additive migration',async()=>{const [migration,durableMigration,civic]=await Promise.all([readFile(new URL('../migrations/0115_seonammedi_civic_canonical.sql',import.meta.url),'utf8'),readFile(new URL('../migrations/0118_seonammedi_voice_durable_ingress.sql',import.meta.url),'utf8'),readFile(new URL('../seonammedi-civic-control.js',import.meta.url),'utf8')]);assert.match(migration,/CREATE TABLE IF NOT EXISTS seonammedi_civic_voices/);assert.match(migration,/idx_seonammedi_civic_voices_created/);assert.doesNotMatch(migration,/DROP TABLE|ALTER TABLE .* RENAME/);assert.match(durableMigration,/ADD COLUMN submission_key/);assert.match(durableMigration,/idx_seonammedi_civic_voices_submission/);assert.doesNotMatch(durableMigration,/DROP TABLE|ALTER TABLE .* RENAME/);assert.match(civic,/await ensureSubmissionKey\(db\)/);});

test('seonammedi civic endpoint exposes durable queue readiness and actionable client errors',async()=>{const [civic,app,policy]=await Promise.all([readFile(new URL('../seonammedi-civic-control.js',import.meta.url),'utf8'),readFile(new URL('app.js',root),'utf8'),readFile(new URL('../platform-security-policy.js',import.meta.url),'utf8')]);assert.match(civic,/HEALTH_PATH=API_PATH\+'\/health'/);assert.match(civic,/async function health\(env\)\{[\s\S]*?await ensureSchema\(env\.DB\)/);assert.match(civic,/enqueueDurableWrite/);assert.match(civic,/durable_queue_unavailable/);assert.match(civic,/write_ingress_failed/);assert.match(civic,/submissionId/);assert.doesNotMatch(civic,/ALTER TABLE seonam_med_civic_voices RENAME/);assert.match(app,/body\.message\|\|body\.error\|\|body\.code/);assert.match(policy,/SELF_PROTECTED_PUBLIC_WRITE_PATHS/);});

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

test('site daily monitor is runtime-owned, source-only and media-evidence aware',async()=>{const [monitor,migration,mediaMigration,canonicalMigration,sourceMigration,app,data]=await Promise.all([readFile(new URL('../seonammedi-monitor.js',import.meta.url),'utf8'),readFile(new URL('../migrations/0104_seonam_medi_monitor.sql',import.meta.url),'utf8'),readFile(new URL('../migrations/0105_seonam_medi_media_evidence.sql',import.meta.url),'utf8'),readFile(new URL('../migrations/0106_seonammedi_canonical_names.sql',import.meta.url),'utf8'),readFile(new URL('../migrations/0107_seonammedi_source_metadata.sql',import.meta.url),'utf8'),readFile(new URL('app.js',root),'utf8'),readFile(new URL('data.json',root),'utf8')]);assert.match(monitor,/runSeonamMediDailyCheck/);assert.match(monitor,/aiProvider:false/);assert.match(monitor,/source_only/);assert.match(monitor,/news\.google\.com\/rss\/search/);assert.match(monitor,/enrichMedia/);assert.match(monitor,/og:video/);assert.match(monitor,/og:image/);assert.match(monitor,/mediaCandidateCount/);assert.match(monitor,/openapi\.naver\.com\/v1\/search\/blog\.json/);assert.match(monitor,/NAVER_CLIENT_ID/);assert.match(monitor,/sourceType:'blog'/);assert.match(migration,/seonam_medi_monitor_runs/);assert.match(migration,/seonam_medi_monitor_items/);assert.match(canonicalMigration,/CREATE TABLE IF NOT EXISTS seonammedi_monitor_runs/);assert.match(canonicalMigration,/CREATE TABLE IF NOT EXISTS seonammedi_monitor_items/);assert.match(canonicalMigration,/INSERT OR IGNORE INTO seonammedi_monitor_runs/);assert.match(canonicalMigration,/INSERT OR IGNORE INTO seonammedi_monitor_items/);assert.doesNotMatch(canonicalMigration,/RENAME TO|DROP TABLE/);assert.match(sourceMigration,/source_type/);assert.match(sourceMigration,/summary_text/);assert.match(mediaMigration,/media_type/);assert.match(mediaMigration,/media_state/);assert.match(app,/attachMonitorMedia/);assert.match(app,/monitorMatches/);assert.match(app,/원문 확인 필요/);const parsed=JSON.parse(data);assert.ok(parsed.timeline.some(row=>Array.isArray(row.monitorKeywords)&&row.monitorKeywords.length));assert.match(parsed.mediaPolicy.autoLinkRule,/근거자료 후보/);assert.ok(Array.isArray(parsed.publicPosts)&&parsed.publicPosts.length>=5);assert.ok(parsed.publicPosts.every(item=>item.date&&item.sourceType&&item.summary&&item.url));assert.match(app,/materialFilters/);});

test('seonammedi static headers allow its first-party CSS, JS, API calls and approved social embeds',async()=>{const headers=await readFile(new URL('../_headers',import.meta.url),'utf8');assert.match(headers,/\/seonammedi\/\*/);assert.match(headers,/style-src 'self'/);assert.match(headers,/script-src 'self'/);assert.match(headers,/connect-src 'self'/);assert.match(headers,/\/seonammedi\/\*[\s\S]{0,500}frame-src https:\/\/www\.instagram\.com https:\/\/www\.youtube-nocookie\.com https:\/\/www\.tiktok\.com/);assert.match(headers,/\/seonammedi\/admin\/\*[\s\S]{0,500}connect-src 'self' https:\/\/renzehysxirjilvdxacv\.supabase\.co/);assert.doesNotMatch(headers,/\/seonammedi\*[\s\S]{0,300}script-src 'none'/);});

test('seonammedi daily monitoring reuses the existing Control API cron instead of adding a sixth Cloudflare trigger',async()=>{const [siteWrangler,apiWrangler,mission,monitor,router]=await Promise.all([readFile(new URL('../wrangler.site.toml',import.meta.url),'utf8'),readFile(new URL('../wrangler.api.toml',import.meta.url),'utf8'),readFile(new URL('../mission-control-entry-worker.js',import.meta.url),'utf8'),readFile(new URL('../seonammedi-monitor.js',import.meta.url),'utf8'),readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8')]);assert.doesNotMatch(siteWrangler,/\[triggers\]/);assert.match(apiWrangler,/crons = \["\*\/10 \* \* \* \*"\]/);assert.match(mission,/runSeonamMediDailyCheck/);assert.match(mission,/getUTCHours\(\) === 23/);assert.match(monitor,/status:'already_checked'/);assert.match(monitor,/existing-control-cron/);assert.doesNotMatch(router,/async scheduled\(_controller,env,ctx\)/);});


test('seonammedi source changes are wired to both Shared Site and Control API releases',async()=>{const [shared,control,manifestText]=await Promise.all([readFile(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8'),readFile(new URL('../.github/workflows/deploy-control-api.yml',import.meta.url),'utf8'),readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8')]);for(const marker of ["sites/seonammedi/public/**","seonammedi-monitor.js","seonammedi-civic-control.js","seonammedi-admin-control.js","migrations/0113_seonammedi_site_admin.sql","migrations/0116_seonammedi_full_menu_admin.sql","test/seonammedi-site.test.mjs"])assert.ok(shared.includes(marker),marker);for(const marker of ["seonammedi-monitor.js","seonammedi-civic-control.js","seonammedi-admin-control.js","migrations/0113_seonammedi_site_admin.sql","migrations/0116_seonammedi_full_menu_admin.sql","test/seonammedi-site.test.mjs"])assert.ok(control.split(marker).length>=3,marker);const manifest=JSON.parse(manifestText);const urls=new Set(manifest.worker.requests.map(item=>item.url));for(const url of ['https://ekodi.kr/seonammedi/','https://ekodi.kr/seonammedi/app.js','https://ekodi.kr/api/seonammedi/voices/health','https://ekodi.kr/seonammedi/data.json','https://ekodi.kr/seonam-medi','https://ekodi.kr/seonam-med'])assert.ok(urls.has(url),url);const publicProbe=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/seonammedi/');assert.ok(publicProbe);assert.ok(!publicProbe.expect.includes('사이트 일일점검'));const adminProbe=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/seonammedi/admin/');assert.ok(adminProbe);for(const label of ['사이트 점검','정적 상태','동적 상태'])assert.ok(!adminProbe.expect.includes(label),label);const legacy=manifest.worker.requests.filter(item=>['https://ekodi.kr/seonam-medi','https://ekodi.kr/seonam-med'].includes(item.url));assert.ok(legacy.every(item=>item.statuses.includes(404)));});


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
  assert.match(adminJs,/CENTRAL_SESSION_KEY='sb-renzehysxirjilvdxacv-auth-token'/);
  assert.match(adminJs,/localStorage\.getItem\(CENTRAL_SESSION_KEY\)/);
  assert.doesNotMatch(adminJs,/cdn\.jsdelivr\.net|createClient\(/);
  assert.match(auth,/site==='portal'.*\/seonammedi\/admin/s);
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
  assert.match(adminHtml,/data-panel-target="status"[^>]*>현재상황<\/button>/);
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
  assert.match(control,/SELECT id FROM seonammedi_timeline WHERE legacy_key=\\?/);
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

test('seonammedi civic voices are manageable from the site admin without exposing contact publicly',async()=>{
  const [control,adminHtml,adminJs]=await Promise.all([
    readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8'),
    readFile(new URL('../sites/seonammedi/public/admin/index.html',import.meta.url),'utf8'),
    readFile(new URL('../sites/seonammedi/public/admin/admin.js',import.meta.url),'utf8')
  ]);
  assert.match(control,/VOICE_CAP='seonammedi\.voice\.manage'/);
  assert.match(control,/admin\/voices/);
  assert.match(control,/public_consent_required/);
  assert.match(control,/DELETE/);
  assert.match(adminHtml,/시민의견 관리/);
  assert.match(adminHtml,/id="voiceList"/);
  assert.match(adminJs,/관리자 전용 연락처/);
  assert.match(adminJs,/publicConsent/);
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
  const publicOrder=['현재상황','소통채널','시민의견','회계','공지','조직'];
  let cursor=-1;for(const label of publicOrder){const next=html.indexOf('>'+label+'</a>',cursor+1);assert.ok(next>cursor,'public menu order: '+label);cursor=next}
  assert.doesNotMatch(html,/data-view-link="records"|data-view-link="timeline"|data-view-link="materials"/);
  assert.match(html,/id="timeline"[^>]*data-view-section="status"/);
  assert.match(html,/id="materials"[^>]*data-view-section="status"/);
  assert.match(html,/id="statusTabs"/);
  assert.match(html,/data-status-tab="timeline"[^>]*>활동이력<\/button>/);
  assert.match(html,/data-status-tab="news"[^>]*>관련보도<\/button>/);
  assert.match(html,/data-status-tab="official"[^>]*>공식기록<\/button>/);
  assert.match(html,/data-status-pane="timeline"/);
  assert.match(html,/data-status-pane="materials"/);
  const adminOrder=['운영홈','현재상황','소통채널','시민의견','회계','공지','조직','내부 회의록','권한·관리자'];
  cursor=-1;for(const label of adminOrder){const next=adminHtml.indexOf('>'+label+'</button>',cursor+1);assert.ok(next>cursor,'admin menu order: '+label);cursor=next}
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
  assert.match(app,/renderMaterialsForStatus\?\.\(isNews\?'관련보도':'공식자료'\)/);
  assert.match(adminHtml,/id="financeForm"/);
  assert.match(adminJs,/\/api\/seonammedi\/admin\/pages\/status/);
  assert.match(adminJs,/\/api\/seonammedi\/admin\/pages\/organization/);
  assert.match(adminJs,/\/api\/seonammedi\/admin\/finance/);
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
  assert.match(app,/async function showChannelPreview\(index\)/);
  assert.match(app,/renderChannelFallback/);
  assert.match(app,/data-channel-index/);
  assert.match(app,/ArrowLeft/);
  assert.match(app,/renderChannelPlatformTabs/);assert.match(app,/showChannelPreview\(publicChannels\.indexOf\(rows\[0\]\)\)/);
  assert.match(adminHtml,/data-panel-target="channels"/);
  assert.match(adminHtml,/소통채널 관리/);
  assert.match(migration,/instagram\.com\/wonokoh/);
  assert.match(migration,/youtube\.com\/@Mokpo-tv/);
  assert.match(migration,/WHERE NOT EXISTS/);
  assert.match(adminHtml,/name="previewUrl"/);
  assert.match(adminHtml,/화면 내 미리보기 URL/);
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
  assert.match(control,/preview\.recentItems=recentItems/);
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
  assert.match(control,/preview\.contentType='explicit-preview'/);
  assert.match(control,/preview_url/);
  assert.match(control,/CHANNEL_BROWSER_UA/);
  assert.match(app,/channelPreviewSeq/);
  assert.match(app,/recentItems/);
  assert.match(app,/channelPreviewEmbedUrl/);
  assert.match(app,/최근 공개 콘텐츠/);
  assert.match(app,/frame\.src='about:blank'/);
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
  assert.match(control,/image_too_large/);assert.match(control,/LIVE_RECORDINGS_BUCKET\.put/);assert.match(control,/noticeImageMatch/);
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
