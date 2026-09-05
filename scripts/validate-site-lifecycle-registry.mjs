import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root=process.cwd();
const readJson=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,''));
const readText=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,'');
const fail=message=>{throw new Error(`Site lifecycle registry invalid: ${message}`)};
const assert=(condition,message)=>{if(!condition)fail(message)};

const registry=readJson('config/site-lifecycle-registry.json');
const workspacePolicy=readJson('config/service-workspace-policy.json');
const marketing=readJson('config/marketing-tenants.json');
const serviceUrls=readJson('config/ekodi-service-urls.json');
const ecosystem=readJson('config/ecosystem-services.json');
const ownedMigration=readText('supabase/migrations/20260823001500_owned_customer_sites_and_local_roles.sql');
const storeSiteMigration=readText('supabase/migrations/20260906005000_store_user_site_provisioning.sql');

assert(registry.generation.signup==='identity_only','signup must create identity only');
assert(registry.generation.canonicalSlugAssigned==='auto_provision_user_site','canonical slug must provision the user site');
assert(registry.generation.optionalServiceActivated==='jit_service_profile','optional services must stay JIT');
assert(registry.identity.authorizationKey==='workspace_id','workspace_id must remain authorization truth');
assert(registry.identity.urlRole==='routing_locator_only','URL must remain a routing locator');
assert(registry.identity.siteCodeCopying===false,'per-site application copying is forbidden');
const sites=registry.existingWorkspaceSites||[];
const ids=new Set();
const canonicalUrls=new Set();
for(const site of sites){
  assert(site.id&&site.name&&site.ownerKind&&site.class,`incomplete site entry ${JSON.stringify(site)}`);
  assert(site.class==='workspace_user_site',`${site.id} must be a workspace user site`);
  assert(!ids.has(site.id),`duplicate workspace site id ${site.id}`);
  ids.add(site.id);
  if(site.canonicalUrl){
    assert(!canonicalUrls.has(site.canonicalUrl),`duplicate canonical URL ${site.canonicalUrl}`);
    canonicalUrls.add(site.canonicalUrl);
  }
  assert(!String(site.action||'').includes('rebuild'),`${site.id} must not be rebuilt as a new app`);
}

const required=['jadam','pizzamaru','yogurt','cgma','ekodi-church','ekodi-biz','ekodi-lab','ekodi-trade','ekodi-cafe'];
for(const id of required)assert(ids.has(id),`existing site ${id} is missing from the migration inventory`);
const byId=Object.fromEntries(sites.map(site=>[site.id,site]));

for(const tenant of marketing.tenants||[]){
  if(!['jadam','pizzamaru','yogurt','cgma'].includes(tenant.tenant))continue;
  const site=byId[tenant.tenant];
  const expectedRoot=String(tenant.canonicalUrl||'').replace(/\/marketing\/?$/,'');
  assert(site.canonicalUrl===expectedRoot,`${tenant.tenant} canonical workspace root differs from Marketing policy`);
  const requiredAliases=[...(tenant.legacyDomains||[]).map(host=>`https://${host}`),`https://${tenant.executionAlias}`];
  for(const alias of requiredAliases)assert((site.legacyAliases||[]).includes(alias),`${tenant.tenant} legacy alias missing: ${alias}`);
}

assert(byId.cgma.canonicalUrl===serviceUrls.canonical.cgma,'CGMA canonical site must match service URL registry');
assert((byId.cgma.customDomains||[]).includes('https://cgma.or.kr'),'CGMA customer-owned public domain must be preserved');
for(const slug of ['ekodi-church','ekodi-biz','ekodi-lab','ekodi-trade','ekodi-cafe']){
  assert(ownedMigration.includes(`'${slug}'`),`owned customer-site migration must still include ${slug}`);
}
assert(ownedMigration.includes("'operating_model','customer-site'"),'owned sites must remain customer-site tenants');
assert(storeSiteMigration.includes('after insert or update of operating_space_slug'),'store user-site automatic provisioning trigger is missing');
assert(storeSiteMigration.includes("'workspace_automatic'"),'store user-site provisioning mode must remain automatic');
assert(storeSiteMigration.includes('Canonical identity remains stores.id'),'store site identity must remain immutable store id');

assert(workspacePolicy.publicWorkspaceRouting.workspaceIdentityKey==='workspace_id','service/workspace policy must use workspace_id');
assert(workspacePolicy.publicWorkspaceRouting.slugRole==='routing_locator_only','service/workspace policy must keep slug non-authoritative');
assert(workspacePolicy.publicWorkspaceRouting.canonicalPattern==='/{slug}','canonical workspace pattern drifted');
assert(registry.workspaceServicePolicy.canonicalPattern==='https://ekodi.kr/{slug}/{service}','workspace service pattern drifted');
assert(registry.workspaceServicePolicy.activation==='jit','workspace services must activate JIT');
assert(registry.servicePolicy.customerWorkspaceMustNotEnterServiceRegistry===true,'customer workspaces must stay out of provider service registry');

const serviceIds=new Set((ecosystem.services||[]).map(service=>service.id));
for(const id of ['jadam','pizzamaru','yogurt','cgma'])assert(!serviceIds.has(id),`${id} leaked into provider service registry`);
for(const service of ecosystem.services||[]){
  if(service.status==='planned')assert(service.productionVerified===false,`planned service ${service.id} cannot be production verified`);
}

const actions=sites.reduce((acc,site)=>{acc[site.action]=(acc[site.action]||0)+1;return acc;},{});
console.log(`EKODI site lifecycle registry OK: ${sites.length} existing workspace sites classified.`);
console.log(`- promoted store sites: ${['jadam','pizzamaru','yogurt'].filter(id=>byId[id]?.migrationState==='promoted').length}`);
console.log(`- retain/link actions: ${Object.entries(actions).map(([key,value])=>`${key}=${value}`).join(', ')}`);
console.log(`- provider services remain independently governed: ${(ecosystem.services||[]).length}`);
console.log('- generation: identity -> workspace -> canonical slug auto-site -> JIT services');
