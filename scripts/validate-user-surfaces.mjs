import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(), failures=[];
const fail=m=>failures.push(m), read=r=>fs.readFileSync(path.join(root,r),'utf8').replace(/^\uFEFF/,''), json=r=>JSON.parse(read(r));
const tenants=json('config/marketing-tenants.json');
if(tenants.hub?.role!=='common_engine'||tenants.hub?.canonicalProductUrl!=='https://ekodi.kr/ekodibiz/marketing-ai') fail('Marketing Core/product separation drift');
if(tenants.namespace?.aiGateway!=='ai.ekodi.kr'||tenants.namespace?.providerTopologyVisibleToOrdinaryUsers!==false) fail('AI Gateway projection policy drift');
const canon={jadam:'https://ekodi.kr/jadam/marketing',pizzamaru:'https://ekodi.kr/pizzamaru/marketing',yogurt:'https://ekodi.kr/yogurt/marketing',cgma:'https://ekodi.kr/cgma/marketing'};
for(const t of tenants.tenants||[]){if(t.canonicalUrl!==canon[t.tenant]) fail(`tenant canonical drift: ${t.tenant}`);if(t.domainRole!=='legacy_execution_alias') fail(`tenant alias role drift: ${t.tenant}`);}
const workspace=json('config/service-workspace-policy.json');
if(workspace.userSurfaceTopologyPolicy?.customerSpecificAiSubdomains!=='forbidden_as_canonical') fail('workspace AI subdomain canonical policy missing');
if(workspace.userSurfaceTopologyPolicy?.examples?.jadamMarketing!==canon.jadam) fail('workspace Jadam marketing canonical drift');
const ecosystem=json('config/ecosystem-services.json').services?.find(x=>x.id==='marketing');
if(ecosystem?.url!=='https://ekodi.kr/ekodibiz/marketing-ai') fail('ecosystem Marketing product URL drift');
const manifest=read('ekodi-service-manifest.js');
if(!manifest.includes("url:'https://ekodi.kr/ekodibiz/marketing-ai'")) fail('service manifest Marketing URL drift');
if(!manifest.includes("engineUrl:'https://marketing.ekodi.kr/'")) fail('service manifest Marketing engine metadata missing');
const surfaces=['index.html','admin-shell.html','hub.html','trade.html','business-worker.js','business/customer-next.js','business/index.html','bible/index.html','community/index.html','life/index.html','social/index.html','energy/app.js','my-worker.js','my/app.js','my/church-marketing-ai.js','my/site-activity-role-ui.js','management-platform.js','config/management-platform.json','service-proxy.js','social-registry-api.js','social/channels.json'];
for(const rel of surfaces){const text=read(rel);if(/https:\/\/marketing\.ekodi\.kr/gi.test(text)) fail(`${rel}: Marketing Core exposed as user entry`);if(/https:\/\/(jadam|pizzamaru|yogurt|cgma)\.ai\.ekodi\.kr/gi.test(text)) fail(`${rel}: customer AI alias exposed as user entry`);}
const constitution=json('governance/constitution/constitution.json');
if(constitution.userSurfaceEngineSeparation?.canonicalMarketingProduct!=='https://ekodi.kr/ekodibiz/marketing-ai') fail('constitutional Marketing product canonical missing');
if(!constitution.registeredCommonServiceBoundaries?.includes('marketing.ekodi.kr')) fail('Marketing Core not registered');
if(!constitution.registeredCoreServiceBoundaries?.includes('ai.ekodi.kr')) fail('AI Gateway/Core not registered');
if(failures.length){console.error(`EKODI user-surface validation failed (${failures.length})`);for(const f of failures) console.error(`- ${f}`);process.exit(1);}
console.log('EKODI user-surface/engine separation: OK');
