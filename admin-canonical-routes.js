(()=>{
'use strict';
const SECTION_GROUP=Object.freeze({
  campus:'home',
  work:'operations',communication:'operations',finance:'operations',tax:'operations',
  clients:'workspaces',organization:'workspaces',workspace:'workspaces','cheonggye-members':'workspaces',
  'common-services':'services','life-ai':'services','personal-finance':'services',community:'services',books:'services',social:'services',devotional:'services','marketing-ai':'services','ai-membership':'services',affiliates:'services','supply-network':'services',insurance:'services',
  'public-site-controls':'system','language-status':'system',architecture:'system',security:'system',admins:'system','ai-module-spec':'system',storage:'system',capabilities:'system',aiops:'system','ai-settings':'system',openai:'system',devices:'system',health:'system','api-cost':'system',services:'system',deployments:'system',policies:'system',
});
const GROUP_DEFAULT=Object.freeze({
  home:'campus',operations:'work',workspaces:'clients',services:'common-services',system:'health',
});
const LEGACY_GROUP_DEFAULT=Object.freeze({
  common:'common-services',professional:'life-ai',space:'clients',spaces:'clients',
});
const LEGACY_SECTION_GROUP=Object.freeze({
  campus:'system',
  communication:'common',workspace:'common',finance:'common','common-services':'common',
  'life-ai':'professional','personal-finance':'professional',community:'professional',books:'professional',social:'professional',devotional:'professional','marketing-ai':'professional','ai-membership':'professional',tax:'professional',affiliates:'professional','supply-network':'professional',insurance:'professional',
  work:'workspaces',
  capabilities:'operations',aiops:'operations','ai-settings':'operations',openai:'operations',devices:'operations',health:'operations','api-cost':'operations',services:'operations',deployments:'operations',policies:'operations',
});
const ALIASES=Object.freeze({
  'ai-ops':'aiops',storige:'storage',release:'deployments','mall-ai-sales':'affiliates',
});
const SECTION_SET=new Set(Object.keys(SECTION_GROUP));
function normalizeSection(value){
  const raw=String(value||'').replace(/^#/,'').trim().toLowerCase();
  if(!raw||raw.includes('=')||raw.includes('&'))return'';
  const section=ALIASES[raw]||raw;
  return SECTION_SET.has(section)?section:'';
}
function pathFor(section){
  const normalized=normalizeSection(section);
  if(!normalized)return'/admin/';
  return `/admin/${SECTION_GROUP[normalized]}/${normalized}`;
}
function sectionFromPath(pathname){
  const parts=String(pathname||'').split('/').filter(Boolean);
  if(parts[0]!=='admin')return'';
  if(parts.length===1)return'';
  const group=String(parts[1]||'').toLowerCase();
  if(parts.length===2)return GROUP_DEFAULT[group]||LEGACY_GROUP_DEFAULT[group]||'';
  const section=normalizeSection(parts[2]);
  if(!section)return'';
  if(SECTION_GROUP[section]===group)return section;
  if(LEGACY_SECTION_GROUP[section]===group)return section;
  if((group==='space'||group==='spaces')&&SECTION_GROUP[section]==='workspaces')return section;
  return'';
}
function sectionFromLocation(loc=window.location){
  const pathSection=sectionFromPath(loc.pathname);
  if(pathSection)return pathSection;
  const query=normalizeSection(new URLSearchParams(loc.search).get('route'));
  if(query)return query;
  return normalizeSection(loc.hash);
}
function legacyHashFor(section){
  const normalized=normalizeSection(section);
  if(!normalized)return'';
  if(normalized==='aiops')return'#ai-ops';
  if(normalized==='affiliates')return'#mall-ai-sales';
  return `#${normalized}`;
}
function canonicalUrl(section,loc=window.location){
  const url=new URL(loc.href);
  url.pathname=pathFor(section);
  url.searchParams.delete('route');
  url.hash='';
  return `${url.pathname}${url.search}${url.hash}`;
}
function isCanonicalHost(loc=window.location){return String(loc.hostname||'').toLowerCase()==='ekodi.kr'}
function navigationTarget(section,loc=window.location){
  return isCanonicalHost(loc)?canonicalUrl(section,loc):legacyHashFor(section);
}
window.EKODIAdminRoutes=Object.freeze({
  version:'1.1.0',
  groups:Object.freeze({...GROUP_DEFAULT}),
  normalizeSection,
  sectionFromPath,
  sectionFromLocation,
  pathFor,
  canonicalUrl,
  legacyHashFor,
  isCanonicalHost,
  navigationTarget,
});
})();
