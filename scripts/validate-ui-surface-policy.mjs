import { readFile } from 'node:fs/promises';
import { EKODI_UI_SURFACE_POLICY, resolveEkodiUiSurface } from '../config/ui-surface-policy.js';

const failures=[];
const fail=message=>failures.push(message);
const required=['platform-public','user-public','member-workspace','tenant-admin','platform-admin','service-admin'];
const actual=Object.keys(EKODI_UI_SURFACE_POLICY.surfaces||{});
for(const id of required) if(!actual.includes(id)) fail(`missing canonical UI surface: ${id}`);
if(EKODI_UI_SURFACE_POLICY.principles?.oneCoreManySurfaces!==true) fail('one Core / many surfaces principle missing');
if(EKODI_UI_SURFACE_POLICY.principles?.platformAndGeneralUserUiSeparated!==true) fail('platform/general-user separation missing');
if(EKODI_UI_SURFACE_POLICY.principles?.adminAuthoritySeparated!==true) fail('admin authority separation missing');
if(EKODI_UI_SURFACE_POLICY.principles?.tenantBrandPrimaryOutsidePlatform!==true) fail('tenant identity priority missing');
if(EKODI_UI_SURFACE_POLICY.principles?.universalConstructionStandard!==true) fail('universal construction standard inheritance missing');
if(EKODI_UI_SURFACE_POLICY.principles?.communicationFirst!==true) fail('communication-first surface principle missing');
if(EKODI_UI_SURFACE_POLICY.principles?.personalizationWithinAuthority!==true) fail('personalization-within-authority principle missing');
for(const principle of ['userSurfaceIsPrimaryOperationalSurface','authenticatedAdminOperatesInPlace','duplicateContentAdminUiForbidden','dedicatedAdminRestrictedToSystemControl']){
  if(EKODI_UI_SURFACE_POLICY.principles?.[principle]!==true) fail(`public-surface administration principle missing: ${principle}`);
}
const adminPolicy=EKODI_UI_SURFACE_POLICY.operationalAdministration||{};
if(adminPolicy.policyId!=='PUBLIC-SURFACE-ADMIN-001'||adminPolicy.status!=='enforced') fail('public-surface administration policy must remain enforced');
if(adminPolicy.scope!=='all-current-and-future-user-independent-and-child-sites') fail('public-surface administration scope drifted');
if(adminPolicy.defaultMode!=='public-surface-first') fail('public surface must remain the default operational surface');
if(adminPolicy.authorityModel!=='same-surface-role-scoped-capabilities') fail('role-scoped same-surface authority model drifted');
for(const capability of ['create','edit','delete','moderate','publish','reorder']) if(!adminPolicy.contentOperations?.includes(capability)) fail(`missing inline admin capability: ${capability}`);
for(const area of ['system-configuration','security','identity-and-access','authority-and-role-management','audit','integration-control','data-recovery','cross-site-platform-operations']) if(!adminPolicy.dedicatedAdminAllowedFor?.includes(area)) fail(`dedicated admin exception missing: ${area}`);
if(adminPolicy.rollout?.pilot!=='seonammedi'||adminPolicy.rollout?.strategy!=='progressive-proof-before-expansion') fail('seonammedi must remain the first verified rollout pilot');
if(!String(adminPolicy.duplicateUiRule||'').includes('must-not-have-separate')) fail('duplicate content management UI prohibition missing');

const constructionStandard=EKODI_UI_SURFACE_POLICY.constructionStandard||{};
for(const dimension of ['ease','locality','readability','originality','intuitiveness']) if(!constructionStandard.dimensions?.includes(dimension)) fail(`construction standard missing dimension: ${dimension}`);
for(const mode of ['communication-first','personalization']) if(!constructionStandard.modes?.includes(mode)) fail(`construction standard missing mode: ${mode}`);
if(constructionStandard.inheritance!=='mandatory') fail('construction standard inheritance must be mandatory');
if(constructionStandard.source!=='config/design-engine.json') fail('construction standard must point to config/design-engine.json');

const cases=[
  [{serviceId:'ekodi',shellSurface:'public'},'platform-public'],
  [{serviceId:'church',shellSurface:'public'},'user-public'],
  [{serviceId:'ekodi',shellSurface:'workspace'},'user-public'],
  [{serviceId:'my',shellSurface:'workspace'},'member-workspace'],
  [{serviceId:'business',shellSurface:'admin',authorityScope:'tenant'},'tenant-admin'],
  [{serviceId:'ekodi',shellSurface:'admin'},'platform-admin'],
  [{serviceId:'books',shellSurface:'admin',authorityScope:'service'},'service-admin'],
];
for(const [input,expected] of cases){
  const actualSurface=resolveEkodiUiSurface(input);
  if(actualSurface!==expected) fail(`${JSON.stringify(input)} resolved ${actualSurface}; expected ${expected}`);
}
const [injector,worker,governor,publicAdminRuntime,principles,seonamApp,seonamVoiceAdmin,seonamCss,seonamControl,seonamTests]=await Promise.all([
  readFile(new URL('../ekodi-shell-injector.js',import.meta.url),'utf8'),
  readFile(new URL('../ekodi-shell-worker.js',import.meta.url),'utf8'),
  readFile(new URL('../shell/ui-surface-governor.js',import.meta.url),'utf8'),
  readFile(new URL('../shell/public-surface-admin.js',import.meta.url),'utf8'),
  readFile(new URL('../docs/ui-system-principles.md',import.meta.url),'utf8'),
  readFile(new URL('../sites/seonammedi/public/app.js',import.meta.url),'utf8'),
  readFile(new URL('../sites/seonammedi/public/voice-public-admin.js',import.meta.url),'utf8'),
  readFile(new URL('../sites/seonammedi/public/app.css',import.meta.url),'utf8'),
  readFile(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8'),
  readFile(new URL('../test/seonammedi-site.test.mjs',import.meta.url),'utf8'),
]);
if(!injector.includes('x-ekodi-ui-surface')) fail('Shell must expose x-ekodi-ui-surface');
if(!injector.includes('data-ekodi-ui-surface')) fail('Shell must expose data-ekodi-ui-surface');
if(!worker.includes('ui-surface-governor.js')) fail('Shell bundle must include UI Surface Governor');
if(!worker.includes('x-ekodi-ui-surface-governor')) fail('Shell bundle must advertise UI Surface Governor');
for(const marker of ['tenant-admin','platform-admin','service-admin',"ekodiScrollOwner='workspace'","overflow-y','auto","overflow-y','hidden"]){
  if(!governor.includes(marker)) fail(`UI Surface Governor missing ${marker}`);
}
for(const marker of ['window.EKODIPublicSurfaceAdmin','cross_origin_admin_target_forbidden',"credentials:'same-origin'",'permissions[key]===true']) if(!publicAdminRuntime.includes(marker)) fail(`PUBLIC-SURFACE-ADMIN-001 runtime missing ${marker}`);
if(!worker.includes("publicSurfaceAdminUrl.pathname='/public-surface-admin.js'")||!worker.includes('x-ekodi-public-surface-admin')) fail('Shell does not bundle PUBLIC-SURFACE-ADMIN-001 runtime');
for(const label of required) if(!principles.includes(label)) fail(`UI system principles missing ${label}`);
for(const marker of ['용이성','지역성·현장성','가독성','독창성','직관성','소통형','맞춤형']) if(!principles.includes(marker)) fail(`UI system principles missing construction principle: ${marker}`);
for(const marker of ['PUBLIC-SURFACE-ADMIN-001','사용자 화면','중복 관리자 UI']) if(!principles.includes(marker)) fail(`UI principles missing public-surface administration contract: ${marker}`);

for(const marker of ['initPublicAdminControls','window.EKODIPublicSurfaceAdmin',"serviceId:'seonammedi'","adminPath:'/seonammedi/admin/'","authEndpoint:'/api/seonammedi/admin/me'",'await admin.authorize()','admin.attach']) if(!seonamApp.includes(marker)) fail(`seonammedi pilot missing shared public-surface admin evidence: ${marker}`);
for(const duplicate of ['function publicAdminRequest','function ensurePublicAdminDrawer','function openPublicAdmin','function attachPublicAdminButton',"className='public-admin-drawer'","className='public-admin-inline'"]) if(seonamApp.includes(duplicate)) fail(`seonammedi must not duplicate shared public admin runtime: ${duplicate}`);
for(const duplicate of ['.public-admin-drawer','.public-admin-inline']) if(seonamCss.includes(duplicate)) fail(`seonammedi must not duplicate shared public admin styling: ${duplicate}`);
if(!seonamCss.includes('.ekodi-public-admin-inline')) fail('seonammedi site-specific shared-admin placement hook missing');
for(const marker of ['canManage','authentication_required']) if(!seonamControl.includes(marker)) fail(`seonammedi pilot missing server authority evidence: ${marker}`);
for(const marker of ['window.EKODIPublicSurfaceAdmin','permissions?.voices===true','/api/seonammedi/admin/voices','data-seonammedi-voice-admin']) if(!seonamVoiceAdmin.includes(marker)) fail(`seonammedi inline citizen-voice admin missing ${marker}`);
if(!seonamTests.includes('uses shared authenticated inline admin without duplicate citizen-voice CRUD')) fail('seonammedi shared public-surface citizen-voice regression test missing');

if(failures.length){
  console.error(`EKODI UI Surface validation failed (${failures.length})`);
  for(const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`EKODI UI Surface policy OK: ${required.length} canonical surfaces inherit the universal construction standard; PUBLIC-SURFACE-ADMIN-001 is enforced with seonammedi as the verified first rollout pilot.`);
