export const PLATFORM_ROUTE_REGISTRY=Object.freeze({
  canonical:Object.freeze(['admin','my','auth','api','mcp','webhooks','health','connect']),
  platformServices:Object.freeze([
    'ai','author','bible','books','business','cafe','cloud','community','cmpmyi','delivery','dev','developer','education','energy','ekodilab','ekodimall','ekodimission','event','experience','finance-api','give','history','insurance','invest','journal','lab','life','live','local-commerce','login','logout','mail','mall','management','marketing','marketing-api','marketing-connect-api','marketing-publish-api','media','messenger','mission','money','pay','personal-finance-api','preview','privacy','publish','publishing','shell','social','status','storage','stores','support','tax','terms','trade','try','work','workspace-api','www'
  ]),
  retiredIdentityPrefixes:Object.freeze(['group','org','personal','project','space','user']),
});

export const PLATFORM_CANONICAL_HOST='ekodi.kr';
export const PLATFORM_SURFACE_PREFIXES=Object.freeze({my:'/my',admin:'/admin',auth:'/auth'});
export const PLATFORM_SYSTEM_PATHS=Object.freeze(['/api','/mcp','/webhooks','/health','/connect']);

export const PLATFORM_EXECUTION_SURFACES=Object.freeze([
  Object.freeze({id:'shell',prefix:'/shell',binding:'SHELL',basePathAware:true}),
  Object.freeze({id:'mission-application',prefix:'/ekodimission/api/activities/260926-chuseok-open-table/applications',binding:'SPACE',preservePrefix:true,basePathAware:true}),
  Object.freeze({id:'ai',prefix:'/ai',binding:'AI'}),
  Object.freeze({id:'author',prefix:'/author',binding:'AUTHOR'}),
  Object.freeze({id:'bible',prefix:'/bible',binding:'BIBLE',basePathAware:true}),
  Object.freeze({id:'books',prefix:'/books',binding:'BOOKS'}),
  Object.freeze({id:'business',prefix:'/business',binding:'BUSINESS'}),
  Object.freeze({id:'community',prefix:'/community',binding:'COMMUNITY'}),
  Object.freeze({id:'education',prefix:'/education',binding:'EDUCATION'}),
  Object.freeze({id:'energy',prefix:'/energy',binding:'ENERGY'}),
  Object.freeze({id:'experience',prefix:'/experience',binding:'EXPERIENCE'}),
  Object.freeze({id:'developer',prefix:'/developer',binding:'EXPERIENCE'}),
  Object.freeze({id:'finance-api',prefix:'/finance-api',binding:'FINANCE',basePathAware:true}),
  Object.freeze({id:'journal',prefix:'/journal',binding:'JOURNAL'}),
  Object.freeze({id:'life',prefix:'/life',binding:'LIFE'}),
  Object.freeze({id:'management',prefix:'/management',binding:'MANAGEMENT'}),
  Object.freeze({id:'money',prefix:'/money',binding:'MONEY'}),
  Object.freeze({id:'personal-finance-api',prefix:'/personal-finance-api',binding:'PERSONAL_FINANCE',basePathAware:true}),
  Object.freeze({id:'publishing',prefix:'/publishing',binding:'PUBLISHING'}),
  Object.freeze({id:'social',prefix:'/social',binding:'SOCIAL'}),
  Object.freeze({id:'space',prefix:'/space',binding:'SPACE'}),
  Object.freeze({id:'storage',prefix:'/storage',binding:'STORAGE',basePathAware:true}),
  Object.freeze({id:'support',prefix:'/support',binding:'SUPPORT',preservePrefix:true,basePathAware:true}),
  Object.freeze({id:'work',prefix:'/work',binding:'WORK'}),
  Object.freeze({id:'workspace-api',prefix:'/workspace-api',binding:'WORKSPACE_PLATFORM',basePathAware:true}),
  Object.freeze({id:'marketing-api',prefix:'/marketing-api',binding:'MARKETING_DOMAIN',basePathAware:true}),
  Object.freeze({id:'marketing-connect-api',prefix:'/marketing-connect-api',binding:'MARKETING_GROWTH',basePathAware:true}),
  Object.freeze({id:'marketing-publish-api',prefix:'/marketing-publish-api',binding:'MARKETING_PUBLISHING',basePathAware:true}),
  Object.freeze({id:'lab',prefix:'/ekodilab',host:'ekodilab.pages.dev'}),
  Object.freeze({id:'cafe',prefix:'/cafe',host:'ekodi-cafe.pages.dev'}),
]);

export const PLATFORM_LEGACY_HOST_PATHS=Object.freeze({});

const RESERVED=new Set(Object.values(PLATFORM_ROUTE_REGISTRY).flat());

export function isReservedPlatformRoot(value){
  return RESERVED.has(String(value||'').trim().toLowerCase());
}

export function platformRouteRegistrySnapshot(){
  return {
    canonical:[...PLATFORM_ROUTE_REGISTRY.canonical],
    platformServices:[...PLATFORM_ROUTE_REGISTRY.platformServices],
    retiredIdentityPrefixes:[...PLATFORM_ROUTE_REGISTRY.retiredIdentityPrefixes],
    reserved:[...RESERVED].sort(),
  };
}

export function platformExecutionSurfaceForPath(pathname){
  const path=String(pathname||'');
  return PLATFORM_EXECUTION_SURFACES.find(item=>item.exact?path===item.prefix:(path===item.prefix||path.startsWith(`${item.prefix}/`)))||null;
}

export function canonicalPathForLegacyHost(host){
  return PLATFORM_LEGACY_HOST_PATHS[String(host||'').trim().toLowerCase()]||'';
}
