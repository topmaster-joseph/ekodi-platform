(()=>{
'use strict';
const SECTION_GROUP=Object.freeze({
  campus:'system','public-site-controls':'system',architecture:'system',security:'system',admins:'system','ai-module-spec':'system',storage:'system',
  'common-services':'common',communication:'common',workspace:'common',finance:'common',
  'life-ai':'professional','personal-finance':'professional',community:'professional',books:'professional',social:'professional',devotional:'professional','marketing-ai':'professional','ai-membership':'professional',tax:'professional','supply-network':'professional',insurance:'professional',
  work:'workspaces',organization:'workspaces',clients:'workspaces','cheonggye-members':'workspaces',
  capabilities:'operations',aiops:'operations','ai-settings':'operations',openai:'operations',devices:'operations',health:'operations','api-cost':'operations',services:'operations',deployments:'operations',policies:'operations',
});
const GROUP_DEFAULT=Object.freeze({
  system:'campus',common:'common-services',professional:'life-ai',workspaces:'clients',operations:'capabilities',
});
const ALIASES=Object.freeze({
  'ai-ops':'aiops',storige:'storage',release:'deployments',
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
  if(parts.length===2)return GROUP_DEFAULT[group]||'';
  const section=normalizeSection(parts[2]);
  if(!section)return'';
  return SECTION_GROUP[section]===group?section:'';
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
  version:'1.0.0',
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
