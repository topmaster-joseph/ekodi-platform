(()=>{
'use strict';
const SECTION_GROUP=Object.freeze({
  'platform-overview':'summary',
  'engine-all':'services','engine-core':'services','engine-common':'services','engine-operations':'services','engine-professional':'services','engine-ai':'services','engine-integration':'services','engine-preview':'services',
  'sites-all':'sites','sites-internal':'sites','sites-user':'sites','sites-customer-partner':'sites','sites-independent':'sites','sites-preparing':'sites',
  campus:'sites',clients:'sites','site-chrome':'sites',organization:'sites',workspace:'sites','cheonggye-members':'sites',
  'common-services':'services',confirmations:'services','life-ai':'services','personal-finance':'services',invest:'services','marketing-ai':'services',affiliates:'services','supply-network':'services',insurance:'services',capabilities:'services',openai:'services',
  'users-access':'people',security:'people',admins:'people','ai-membership':'people',
  work:'content',communication:'content',community:'content',books:'content',devotional:'content',social:'content',finance:'content',tax:'content',
  'executor-registry':'status','executor-infrastructure':'status','executor-jobs':'status','executor-verification':'status','executor-policies':'status',
  health:'status',deployments:'status',aiops:'status',devices:'status','api-cost':'status',architecture:'status',maturity:'status',services:'status',
  'public-site-controls':'settings-records','language-status':'settings-records','ai-module-spec':'settings-records',storage:'settings-records','ai-settings':'settings-records','audit-records':'settings-records',policies:'settings-records',
});
const GROUP_DEFAULT=Object.freeze({
  summary:'platform-overview',services:'engine-all',sites:'sites-all',people:'users-access',content:'work',status:'health','settings-records':'public-site-controls',
});
const LEGACY_GROUP_DEFAULT=Object.freeze({
  home:'command-home',operations:'work',workspaces:'clients',community:'community',publishing:'books',system:'health',
  common:'common-services',professional:'life-ai',space:'clients',spaces:'clients',
});
const LEGACY_SECTION_GROUP=Object.freeze({
  campus:'home',
  work:'operations',communication:'operations',finance:'operations',tax:'operations',
  clients:'workspaces','site-chrome':'workspaces',organization:'workspaces',workspace:'workspaces','cheonggye-members':'workspaces',
  community:'community','ai-membership':'community',
  books:'publishing',devotional:'publishing',
  'public-site-controls':'system','language-status':'system',architecture:'system',maturity:'system',security:'system',admins:'system','ai-module-spec':'system',storage:'system',capabilities:'system',aiops:'system','ai-settings':'system',openai:'system',devices:'system',health:'system','api-cost':'system',services:'system',deployments:'system',policies:'system',
  'common-services':'common','life-ai':'professional','personal-finance':'professional',invest:'professional',social:'professional','marketing-ai':'professional',affiliates:'professional','supply-network':'professional',insurance:'professional',
});
const ALIASES=Object.freeze({
  'ai-ops':'aiops',storige:'storage',release:'deployments','mall-ai-sales':'affiliates',
});
const COMMAND_HOME='command-home';
const SECTION_SET=new Set([COMMAND_HOME,...Object.keys(SECTION_GROUP)]);
function normalizeSection(value){
  const raw=String(value||'').replace(/^#/,'').trim().toLowerCase();
  if(!raw||raw.includes('=')||raw.includes('&'))return'';
  const section=ALIASES[raw]||raw;
  return SECTION_SET.has(section)?section:'';
}
function pathFor(section){
  const normalized=normalizeSection(section);
  if(!normalized||normalized===COMMAND_HOME)return'/admin/';
  return `/admin/${SECTION_GROUP[normalized]}/${normalized}`;
}
function sectionFromPath(pathname){
  const parts=String(pathname||'').split('/').filter(Boolean);
  if(parts[0]!=='admin')return'';
  if(parts.length===1)return COMMAND_HOME;
  const group=String(parts[1]||'').toLowerCase();
  if(parts.length===2)return group==='home'?COMMAND_HOME:(GROUP_DEFAULT[group]||LEGACY_GROUP_DEFAULT[group]||'');
  const section=normalizeSection(parts[2]);
  if(!section)return'';
  if(SECTION_GROUP[section]===group)return section;
  if(LEGACY_SECTION_GROUP[section]===group)return section;
  if(section==='campus'&&['home','system'].includes(group))return section;
  if(group==='services'&&['community','ai-membership','books','devotional'].includes(section))return section;
  if((group==='space'||group==='spaces')&&LEGACY_SECTION_GROUP[section]==='workspaces')return section;
  return'';
}
function sectionFromLocation(loc=window.location){
  const pathSection=sectionFromPath(loc.pathname);
  if(pathSection&&pathSection!==COMMAND_HOME)return pathSection;
  const query=normalizeSection(new URLSearchParams(loc.search).get('route'));
  if(query)return query;
  const hash=normalizeSection(loc.hash);
  if(hash)return hash;
  return pathSection;
}
function legacyHashFor(section){
  const normalized=normalizeSection(section);
  if(!normalized||normalized===COMMAND_HOME)return'';
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
  version:'1.4.0',
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
