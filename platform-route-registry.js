export const PLATFORM_ROUTE_REGISTRY=Object.freeze({
  canonical:Object.freeze(['admin','my','auth','api','mcp','webhooks','health','connect']),
  platformServices:Object.freeze([
    'ai','author','bible','books','business','cafe','cloud','community','cmpmyi','delivery','dev','developer','education','energy','ekodibiz','ekodilab','ekodimall','ekodimission','event','experience','finance-api','give','history','insurance','invest','journal','lab','life','live','local-commerce','login','logout','mail','mall','management','marketing','marketing-api','marketing-connect-api','marketing-publish-api','media','messenger','mission','money','pay','personal-finance-api','preview','privacy','publish','publishing','shell','social','status','storage','stores','support','tax','terms','trade','try','work','workspace-api','www'
  ]),
  retiredIdentityPrefixes:Object.freeze(['group','org','personal','project','space','user']),
});

export const PLATFORM_CANONICAL_HOST='ekodi.kr';
export const PLATFORM_SURFACE_PREFIXES=Object.freeze({my:'/my',admin:'/admin',auth:'/auth'});
export const PLATFORM_SYSTEM_PATHS=Object.freeze(['/api','/mcp','/webhooks','/health','/connect']);

export const PLATFORM_EXECUTION_SURFACES=Object.freeze([
  Object.freeze({id:'shell',prefix:'/shell',binding:'SHELL',basePathAware:true}),
  Object.freeze({id:'mission-application',prefix:'/ekodimission/api/activities/260926-chuseok-open-table/applications',binding:'SPACE',preservePrefix:true,basePathAware:true}),
  Object.freeze({id:'ai',prefix:'/ai',binding:'AI',virtualHost:'ai.ekodi.kr'}),
  Object.freeze({id:'author',prefix:'/author',binding:'AUTHOR',virtualHost:'author.ekodi.kr'}),
  Object.freeze({id:'bible',prefix:'/bible',binding:'BIBLE',basePathAware:true}),
  Object.freeze({id:'books',prefix:'/books',binding:'BOOKS',virtualHost:'books.ekodi.kr'}),
  Object.freeze({id:'business',prefix:'/business',binding:'BUSINESS',virtualHost:'business.ekodi.kr',host:'business.ekodi.kr'}),
  Object.freeze({id:'community',prefix:'/community',binding:'COMMUNITY',virtualHost:'community.ekodi.kr'}),
  Object.freeze({id:'education',prefix:'/education',binding:'EDUCATION',virtualHost:'edu.ekodi.kr'}),
  Object.freeze({id:'energy',prefix:'/energy',binding:'ENERGY',virtualHost:'energy.ekodi.kr'}),
  Object.freeze({id:'experience',prefix:'/experience',binding:'EXPERIENCE',virtualHost:'exp.ekodi.kr'}),
  Object.freeze({id:'developer',prefix:'/developer',binding:'EXPERIENCE',virtualHost:'dev.ekodi.kr'}),
  Object.freeze({id:'finance-api',prefix:'/finance-api',binding:'FINANCE',virtualHost:'finance-api.ekodi.kr',basePathAware:true}),
  Object.freeze({id:'journal',prefix:'/journal',binding:'JOURNAL',virtualHost:'journal.ekodi.kr'}),
  Object.freeze({id:'life',prefix:'/life',binding:'LIFE',virtualHost:'life.ekodi.kr'}),
  Object.freeze({id:'management',prefix:'/management',binding:'MANAGEMENT',virtualHost:'management.ekodi.kr'}),
  Object.freeze({id:'money',prefix:'/money',binding:'MONEY',virtualHost:'money.ekodi.kr'}),
  Object.freeze({id:'personal-finance-api',prefix:'/personal-finance-api',binding:'PERSONAL_FINANCE',virtualHost:'personal-finance-api.ekodi.kr',basePathAware:true}),
  Object.freeze({id:'publishing',prefix:'/publishing',binding:'PUBLISHING',virtualHost:'publishing.ekodi.kr'}),
  Object.freeze({id:'social',prefix:'/social',binding:'SOCIAL',virtualHost:'social.ekodi.kr'}),
  Object.freeze({id:'space',prefix:'/space',binding:'SPACE',virtualHost:'space.ekodi.kr'}),
  Object.freeze({id:'storage',prefix:'/storage',binding:'STORAGE',virtualHost:'drive.ekodi.kr',basePathAware:true}),
  Object.freeze({id:'support',prefix:'/support',binding:'SUPPORT',preservePrefix:true,basePathAware:true}),
  Object.freeze({id:'work',prefix:'/work',binding:'WORK',virtualHost:'work.ekodi.kr'}),
  Object.freeze({id:'workspace-api',prefix:'/workspace-api',binding:'WORKSPACE_PLATFORM',virtualHost:'workspace-api.ekodi.kr',basePathAware:true}),
  Object.freeze({id:'marketing-api',prefix:'/marketing-api',binding:'MARKETING_DOMAIN',virtualHost:'marketing-api.ekodi.kr',basePathAware:true}),
  Object.freeze({id:'marketing-connect-api',prefix:'/marketing-connect-api',binding:'MARKETING_GROWTH',virtualHost:'marketing-connect-api.ekodi.kr',basePathAware:true}),
  Object.freeze({id:'marketing-publish-api',prefix:'/marketing-publish-api',binding:'MARKETING_PUBLISHING',virtualHost:'marketing-publish-api.ekodi.kr',basePathAware:true}),
  Object.freeze({id:'pay',prefix:'/pay',legacyHost:'pay.ekodi.kr'}),
  Object.freeze({id:'live',prefix:'/live',legacyHost:'live.ekodi.kr'}),
  Object.freeze({id:'cloud',prefix:'/cloud',legacyHost:'cloud.ekodi.kr'}),
  Object.freeze({id:'trade',prefix:'/trade',legacyHost:'trade.ekodi.kr'}),
  Object.freeze({id:'lab',prefix:'/ekodilab',host:'ekodilab.pages.dev',canonicalHost:'lab.ekodi.kr'}),
  Object.freeze({id:'cafe',prefix:'/cafe',host:'ekodi-cafe.pages.dev',canonicalHost:'cafe.ekodi.kr'}),
]);

const legacyEkodiHost=label=>`${label}.${PLATFORM_CANONICAL_HOST}`;
export const PLATFORM_LEGACY_HOST_PATHS=Object.freeze({
  [legacyEkodiHost('admin')]:'/admin',[legacyEkodiHost('my')]:'/my',
  'ai.ekodi.kr':'/ai','author.ekodi.kr':'/author','bible.ekodi.kr':'/bible',
  'books.ekodi.kr':'/books','business.ekodi.kr':'/business','community.ekodi.kr':'/community','edu.ekodi.kr':'/education',
  'energy.ekodi.kr':'/energy','exp.ekodi.kr':'/experience','try.ekodi.kr':'/experience','dev.ekodi.kr':'/developer',
  'finance-api.ekodi.kr':'/finance-api','journal.ekodi.kr':'/journal','life.ekodi.kr':'/life','management.ekodi.kr':'/management',
  'money.ekodi.kr':'/money','personal-finance-api.ekodi.kr':'/personal-finance-api','publishing.ekodi.kr':'/publishing',
  'social.ekodi.kr':'/social','space.ekodi.kr':'/space','drive.ekodi.kr':'/storage',
  'work.ekodi.kr':'/work','workspace-api.ekodi.kr':'/workspace-api','marketing-api.ekodi.kr':'/marketing-api',
  'marketing-connect-api.ekodi.kr':'/marketing-connect-api','marketing-publish-api.ekodi.kr':'/marketing-publish-api',
  'pay.ekodi.kr':'/pay','pay.biz.ekodi.kr':'/ekodibiz/pay','live.ekodi.kr':'/live','live.biz.ekodi.kr':'/live/biz',
  'live.church.ekodi.kr':'/live/church','live.lab.ekodi.kr':'/live/lab','cloud.ekodi.kr':'/cloud','trade.ekodi.kr':'/trade',
  'trade.biz.ekodi.kr':'/ekodibiz/trade','biz.ekodi.kr':'/ekodibiz','church.ekodi.kr':'/ekodichurch','lab.ekodi.kr':'/ekodilab',
  'mall.ekodi.kr':'/ekodibiz/mall','mall.biz.ekodi.kr':'/ekodibiz/mall','mail.ekodi.kr':'/mail','mail.biz.ekodi.kr':'/mail',
  'mail.church.ekodi.kr':'/mail','mail.lab.ekodi.kr':'/mail','mail.books.ekodi.kr':'/mail','mail.trade.ekodi.kr':'/mail',
  'messenger.ekodi.kr':'/messenger','invest.ekodi.kr':'/invest','tax.ekodi.kr':'/tax','cafe.ekodi.kr':'/cafe',
  'marketing.ekodi.kr':'/ekodibiz/marketing-ai','cgma.ekodi.kr':'/cgma','jadam.ekodi.kr':'/jadam','pizzamaru.ekodi.kr':'/pizzamaru','yogurt.ekodi.kr':'/yogurt',
  'jadam.ai.ekodi.kr':'/jadam/marketing','pizzamaru.ai.ekodi.kr':'/pizzamaru/marketing','yogurt.ai.ekodi.kr':'/yogurt/marketing','cgma.ai.ekodi.kr':'/cgma/marketing'
});

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
