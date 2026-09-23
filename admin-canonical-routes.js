(()=>{
'use strict';
const SECTION_GROUP=Object.freeze({
  'platform-overview':'summary',
  'engine-all':'services','engine-core':'services','engine-common':'services','engine-operations':'services','engine-professional':'services','engine-ai':'services','engine-integration':'services','engine-preview':'services',
  'sites-all':'sites','sites-core':'sites','sites-business':'sites','sites-community':'sites','sites-clients':'sites','sites-knowledge':'sites','sites-communication':'sites','sites-worklife':'sites','sites-other':'sites','sites-preparing':'sites','sites-internal':'sites','sites-user':'sites','sites-customer-partner':'sites','sites-independent':'sites',
  campus:'sites',clients:'sites','site-chrome':'sites',organization:'sites',workspace:'sites','cheonggye-members':'sites',
  'common-services':'services',confirmations:'services','life-ai':'services','personal-finance':'services',invest:'services','marketing-ai':'services',affiliates:'services','supply-network':'services',insurance:'services',capabilities:'services',openai:'services',
  'users-access':'people',security:'people',admins:'people','ai-membership':'people',
  work:'content',communication:'content',community:'content',books:'content',devotional:'content',social:'content',finance:'content',tax:'content',
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
function normalizeDetailSegments(value){
  const source=Array.isArray(value)?value:(value==null||value===''?[]:[value]);
  const result=[];
  for(const raw of source){
    let decoded=String(raw??'').trim();
    try{decoded=decodeURIComponent(decoded)}catch{}
    if(!decoded||decoded==='.'||decoded==='..'||/[\\/]/.test(decoded))continue;
    result.push(decoded);
  }
  return result;
}
function pathFor(section,detailSegments=[]){
  const normalized=normalizeSection(section);
  if(!normalized||normalized===COMMAND_HOME)return'/admin/';
  const base=`/admin/${SECTION_GROUP[normalized]}/${normalized}`;
  const detail=normalizeDetailSegments(detailSegments);
  return detail.length?`${base}/${detail.map(encodeURIComponent).join('/')}`:base;
}
function routeFromPath(pathname){
  const parts=String(pathname||'').split('/').filter(Boolean);
  if(parts[0]!=='admin')return null;
  if(parts.length===1)return Object.freeze({section:COMMAND_HOME,group:'home',detailSegments:Object.freeze([])});
  const group=String(parts[1]||'').toLowerCase();
  if(parts.length===2){
    const section=group==='home'?COMMAND_HOME:(GROUP_DEFAULT[group]||LEGACY_GROUP_DEFAULT[group]||'');
    return section?Object.freeze({section,group,detailSegments:Object.freeze([])}):null;
  }
  const section=normalizeSection(parts[2]);
  if(!section)return null;
  const valid=SECTION_GROUP[section]===group
    ||LEGACY_SECTION_GROUP[section]===group
    ||(section==='campus'&&['home','system'].includes(group))
    ||(group==='services'&&['community','ai-membership','books','devotional'].includes(section))
    ||((group==='space'||group==='spaces')&&LEGACY_SECTION_GROUP[section]==='workspaces');
  if(!valid)return null;
  const detailSegments=normalizeDetailSegments(parts.slice(3));
  return Object.freeze({section,group,detailSegments:Object.freeze(detailSegments)});
}
function sectionFromPath(pathname){
  return routeFromPath(pathname)?.section||'';
}
function sectionFromLocation(loc=window.location){
  const pathSection=sectionFromPath(loc.pathname);
  if(pathSection&&pathSection!==COMMAND_HOME)return pathSection;
  const params=new URLSearchParams(loc.search);
  const query=normalizeSection(params.get('route'));
  if(query)return query;
  if(pathSection===COMMAND_HOME&&String(params.get('service')||'').trim())return'engine-all';
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
function canonicalUrl(section,loc=window.location,detailSegments=[]){
  const url=new URL(loc.href);
  url.pathname=pathFor(section,detailSegments);
  url.searchParams.delete('route');
  url.hash='';
  return `${url.pathname}${url.search}${url.hash}`;
}
function isCanonicalHost(loc=window.location){return String(loc.hostname||'').toLowerCase()==='ekodi.kr'}
function navigationTarget(section,loc=window.location,detailSegments=null){
  if(!isCanonicalHost(loc))return legacyHashFor(section);
  const normalized=normalizeSection(section);
  const current=detailSegments==null?routeFromPath(loc.pathname):null;
  const detail=detailSegments==null&&current?.section===normalized?current.detailSegments:detailSegments;
  return canonicalUrl(section,loc,detail||[]);
}
window.EKODIAdminRoutes=Object.freeze({
  version:'1.5.0',
  groups:Object.freeze({...GROUP_DEFAULT}),
  normalizeSection,
  normalizeDetailSegments,
  routeFromPath,
  sectionFromPath,
  sectionFromLocation,
  pathFor,
  canonicalUrl,
  legacyHashFor,
  isCanonicalHost,
  navigationTarget,
});
})();
