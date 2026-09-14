import fs from 'node:fs';
const fail=[];
const hierarchy=JSON.parse(fs.readFileSync('config/admin-site-hierarchy.json','utf8'));
const canonical=publicPath=>publicPath==='/'?'/admin':`${String(publicPath).replace(/\/+$/,'')}/admin`;
if(hierarchy.platformAdmin?.adminPath!=='/admin')fail.push('platform admin must remain /admin');
const sites=Array.isArray(hierarchy.sites)?hierarchy.sites:[];
const ids=new Set(sites.map(x=>x.id));
const adminPaths=new Set();
for(const site of sites){
  if(site.adminPath!==canonical(site.publicPath))fail.push(`${site.id} adminPath must equal publicPath + /admin`);
  if(adminPaths.has(site.adminPath))fail.push(`duplicate adminPath ${site.adminPath}`);adminPaths.add(site.adminPath);
  if(site.parentId!=='platform'&&!ids.has(site.parentId))fail.push(`${site.id} parentId missing: ${site.parentId}`);
}
for(const row of [...(hierarchy.forbiddenAggregationAliases||[]),...(hierarchy.legacyCompatibilityAliases||[])]){
  if(!adminPaths.has(row.canonical))fail.push(`alias canonical is not a registered site admin: ${row.alias}`);
  if(adminPaths.has(row.alias))fail.push(`alias collides with canonical admin: ${row.alias}`);
}
const registry=fs.readFileSync('ekodibiz-admin-registry.js','utf8');
if(!registry.includes("adminHref: '/ekodibiz/ekodimall/admin'"))fail.push('EKODIBIZ Mall handoff must use Mall canonical admin');
if(registry.includes("adminHref: '/admin/ekodimall'"))fail.push('EKODIBIZ registry must not expose central Mall alias');
const source=fs.readFileSync('platform-router-entry-worker.js','utf8');
if(!source.includes('legacyAdminAliasTarget'))fail.push('platform router must guard legacy/aggregate admin aliases');
if(source.includes('isIntegratedStoreAdminPathShape'))fail.push('platform router must not render integrated store child-admin aliases');
const boundaries=JSON.parse(fs.readFileSync('config/service-layer-boundaries.json','utf8'));
if(boundaries.serviceOwnership?.mall?.adminRoot!=='/ekodibiz/ekodimall/admin')fail.push('Mall ownership adminRoot drifted');
if(fail.length){console.error(`Admin site hierarchy validation failed (${fail.length})`);for(const x of fail)console.error(`- ${x}`);process.exit(1)}
console.log(`Admin site hierarchy v${hierarchy.version}: OK (${sites.length} canonical site admins)`);