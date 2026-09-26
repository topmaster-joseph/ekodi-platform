import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(), failures=[];
const fail=m=>failures.push(m), read=r=>fs.readFileSync(path.join(root,r),'utf8').replace(/^\uFEFF/,''), json=r=>JSON.parse(read(r));
const tenants=json('config/marketing-tenants.json');
if(tenants.hub?.role!=='common_engine'||tenants.hub?.canonicalProductUrl!=='https://ekodi.kr/ekodibiz/marketing-ai') fail('Marketing Core/product separation drift');
if(tenants.namespace?.aiGateway!=='ekodi.kr/ai'||tenants.namespace?.providerTopologyVisibleToOrdinaryUsers!==false) fail('AI Gateway projection policy drift');
const canon={jadam:'https://ekodi.kr/jadam/marketing',pizzamaru:'https://ekodi.kr/pizzamaru/marketing',yogurt:'https://ekodi.kr/yogurt/marketing',cgma:'https://ekodi.kr/cgma/marketing'};
for(const t of tenants.tenants||[]){if(t.canonicalUrl!==canon[t.tenant]) fail(`tenant canonical drift: ${t.tenant}`);if(t.domainRole!=='legacy_execution_alias') fail(`tenant alias role drift: ${t.tenant}`);}
const workspace=json('config/service-workspace-policy.json');
const constitution=json('governance/constitution/constitution.json');
const publicUserSurface=constitution.publicUserSurfacePolicy||{};
if(publicUserSurface.defaultAccess!=='guest-open'||publicUserSurface.canonicalPublicLoginWallForbidden!==true) fail('constitutional guest-open public user surface policy missing');
if(publicUserSurface.permissionFailureReplacesPublicPage!==false) fail('public page must survive protected capability permission failures');
if(workspace.publicUserSurfaceDefault?.defaultAccess!=='guest-open'||workspace.publicUserSurfaceDefault?.loginEffect!=='enhance-not-replace') fail('workspace public user surface default missing');
for(const visibility of workspace.visibilityPolicies||[]) if(visibility.id!=='guest_visible'&&visibility.mayReplaceCanonicalPublicRoot!==false) fail(`${visibility.id} can replace canonical public root`);
if(workspace.userSurfaceTopologyPolicy?.customerSpecificAiSubdomains!=='forbidden') fail('workspace AI subdomain canonical policy missing');
if(workspace.userSurfaceTopologyPolicy?.examples?.jadamMarketing!==canon.jadam) fail('workspace Jadam marketing canonical drift');
const ecosystem=json('config/ecosystem-services.json').services?.find(x=>x.id==='marketing');
if(ecosystem?.url!=='https://ekodi.kr/ekodibiz/marketing-ai') fail('ecosystem Marketing product URL drift');
const manifest=read('ekodi-service-manifest.js');
if(!manifest.includes("url:'https://ekodi.kr/ekodibiz/marketing-ai'")) fail('service manifest Marketing URL drift');
if(!manifest.includes("engineUrl:'https://ekodi.kr/marketing/'")) fail('service manifest Marketing engine metadata missing');
const shell=read('shell/shell.js');
const spaceApp=read('space/app.js');
if(!shell.includes('canonicalPublicUserSurface()')||!shell.includes('if(isPublicSurface()||canonicalPublicUserSurface())return false')) fail('shared Shell can still gate a canonical public user page');
if(!spaceApp.includes('renderPublicWorkspaceFallback')||/접근할 수 없는 공간/.test(spaceApp)||/공간 접근 권한을 확인해 주세요/.test(spaceApp)) fail('Workspace UI can still replace public pages with permission-denied copy');
const surfaces=['index.html','admin-shell.html','hub.html','trade.html','business-worker.js','business/customer-next.js','business/index.html','bible/index.html','community/index.html','life/index.html','social/index.html','energy/app.js','my-worker.js','my/app.js','my/church-marketing-ai.js','my/site-activity-role-ui.js','management-platform.js','config/management-platform.json','social-registry-api.js','social/channels.json'];
for(const rel of surfaces){const text=read(rel);if(/https:\/\/marketing\.ekodi\.kr/gi.test(text)) fail(`${rel}: Marketing Core exposed as user entry`);if(/https:\/\/(jadam|pizzamaru|yogurt|cgma)\.ai\.ekodi\.kr/gi.test(text)) fail(`${rel}: customer AI alias exposed as user entry`);}
if(constitution.userSurfaceEngineSeparation?.canonicalMarketingProduct!=='https://ekodi.kr/ekodibiz/marketing-ai') fail('constitutional Marketing product canonical missing');
if(!constitution.registeredCommonServiceBoundaries?.includes('/marketing')) fail('Marketing Core not registered');
if(!constitution.registeredCoreServiceBoundaries?.includes('/ai')) fail('AI Gateway/Core not registered');
if(failures.length){console.error(`EKODI user-surface validation failed (${failures.length})`);for(const f of failures) console.error(`- ${f}`);process.exit(1);}
console.log('EKODI user-surface/engine separation: OK');
