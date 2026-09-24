export const PLATFORM_ROUTE_REGISTRY=Object.freeze({
  canonical:Object.freeze(['admin','my','auth','api','mcp','webhooks','health','connect']),
  platformServices:Object.freeze([
    'ai','author','bible','books','business','cafe','cloud','community','cmpmyi','delivery','dev','developer','education','energy','ekodibiz','ekodilab','ekodimall','ekodimission','event','experience','finance-api','give','history','insurance','invest','journal','lab','life','live','local-commerce','login','logout','mail','mall','management','marketing','marketing-api','marketing-connect-api','marketing-publish-api','media','messenger','mission','money','pay','personal-finance-api','preview','privacy','publish','publishing','shell','social','status','storage','stores','support','tax','terms','trade','try','work','workspace-api','www'
  ]),
  retiredIdentityPrefixes:Object.freeze(['group','org','personal','project','space','user']),
});

export const PLATFORM_CANONICAL_HOST='ekodi.kr';
export const platformHost=label=>`${String(label||'').trim().toLowerCase()}.${PLATFORM_CANONICAL_HOST}`;
export const PLATFORM_SURFACE_PREFIXES=Object.freeze({my:'/my',admin:'/admin',auth:'/auth'});
export const PLATFORM_SYSTEM_PATHS=Object.freeze(['/api','/mcp','/webhooks','/health','/connect']);

export const PLATFORM_EXECUTION_SURFACES=Object.freeze([
  Object.freeze({id:'shell',prefix:'/shell',binding:'SHELL',basePathAware:true}),
  Object.freeze({id:'mission-application',prefix:'/ekodimission/api/activities/260926-chuseok-open-table/applications',binding:'SPACE',preservePrefix:true,basePathAware:true}),
  Object.freeze({id:'ai',prefix:'/ai',binding:'AI',virtualHost:platformHost('ai')}),
  Object.freeze({id:'author',prefix:'/author',binding:'AUTHOR',virtualHost:platformHost('author')}),
  Object.freeze({id:'bible',prefix:'/bible',binding:'BIBLE',basePathAware:true}),
  Object.freeze({id:'books',prefix:'/books',binding:'BOOKS',virtualHost:platformHost('books')}),
  Object.freeze({id:'business',prefix:'/business',binding:'BUSINESS',virtualHost:platformHost('business'),host:platformHost('business')}),
  Object.freeze({id:'community',prefix:'/community',binding:'COMMUNITY',virtualHost:platformHost('community')}),
  Object.freeze({id:'education',prefix:'/education',binding:'EDUCATION',virtualHost:platformHost('edu')}),
  Object.freeze({id:'energy',prefix:'/energy',binding:'ENERGY',virtualHost:platformHost('energy')}),
  Object.freeze({id:'experience',prefix:'/experience',binding:'EXPERIENCE',virtualHost:platformHost('exp')}),
  Object.freeze({id:'developer',prefix:'/developer',binding:'EXPERIENCE',virtualHost:platformHost('dev')}),
  Object.freeze({id:'finance-api',prefix:'/finance-api',binding:'FINANCE',virtualHost:platformHost('finance-api'),basePathAware:true}),
  Object.freeze({id:'journal',prefix:'/journal',binding:'JOURNAL',virtualHost:platformHost('journal')}),
  Object.freeze({id:'life',prefix:'/life',binding:'LIFE',virtualHost:platformHost('life')}),
  Object.freeze({id:'management',prefix:'/management',binding:'MANAGEMENT',virtualHost:platformHost('management')}),
  Object.freeze({id:'money',prefix:'/money',binding:'MONEY',virtualHost:platformHost('money')}),
  Object.freeze({id:'personal-finance-api',prefix:'/personal-finance-api',binding:'PERSONAL_FINANCE',virtualHost:platformHost('personal-finance-api'),basePathAware:true}),
  Object.freeze({id:'publishing',prefix:'/publishing',binding:'PUBLISHING',virtualHost:platformHost('publishing')}),
  Object.freeze({id:'social',prefix:'/social',binding:'SOCIAL',virtualHost:platformHost('social')}),
  Object.freeze({id:'space',prefix:'/space',binding:'SPACE',virtualHost:platformHost('space')}),
  Object.freeze({id:'storage',prefix:'/storage',binding:'STORAGE',virtualHost:platformHost('drive'),basePathAware:true}),
  Object.freeze({id:'support',prefix:'/support',binding:'SUPPORT',preservePrefix:true,basePathAware:true}),
  Object.freeze({id:'work',prefix:'/work',binding:'WORK',virtualHost:platformHost('work')}),
  Object.freeze({id:'workspace-api',prefix:'/workspace-api',binding:'WORKSPACE_PLATFORM',virtualHost:platformHost('workspace-api'),basePathAware:true}),
  Object.freeze({id:'marketing-api',prefix:'/marketing-api',binding:'MARKETING_DOMAIN',virtualHost:platformHost('marketing-api'),basePathAware:true}),
  Object.freeze({id:'marketing-connect-api',prefix:'/marketing-connect-api',binding:'MARKETING_GROWTH',virtualHost:platformHost('marketing-connect-api'),basePathAware:true}),
  Object.freeze({id:'marketing-publish-api',prefix:'/marketing-publish-api',binding:'MARKETING_PUBLISHING',virtualHost:platformHost('marketing-publish-api'),basePathAware:true}),
  Object.freeze({id:'pay',prefix:'/pay',legacyHost:platformHost('pay')}),
  Object.freeze({id:'live',prefix:'/live',legacyHost:platformHost('live')}),
  Object.freeze({id:'cloud',prefix:'/cloud',legacyHost:platformHost('cloud')}),
  Object.freeze({id:'trade',prefix:'/trade',legacyHost:platformHost('trade')}),
  Object.freeze({id:'lab',prefix:'/ekodilab',host:'ekodilab.pages.dev',canonicalHost:platformHost('lab')}),
  Object.freeze({id:'cafe',prefix:'/cafe',host:'ekodi-cafe.pages.dev',canonicalHost:platformHost('cafe')}),
]);

export const PLATFORM_LEGACY_HOST_PATHS=Object.freeze({
  [platformHost('admin')]:'/admin',[platformHost('my')]:'/my',[platformHost('auth')]:'/auth',
  [platformHost('ai')]:'/ai',[platformHost('author')]:'/author',[platformHost('bible')]:'/bible',
  [platformHost('books')]:'/books',[platformHost('business')]:'/business',[platformHost('community')]:'/community',[platformHost('edu')]:'/education',
  [platformHost('energy')]:'/energy',[platformHost('exp')]:'/experience',[platformHost('try')]:'/experience',[platformHost('dev')]:'/developer',
  [platformHost('finance-api')]:'/finance-api',[platformHost('journal')]:'/journal',[platformHost('life')]:'/life',[platformHost('management')]:'/management',
  [platformHost('money')]:'/money',[platformHost('personal-finance-api')]:'/personal-finance-api',[platformHost('publishing')]:'/publishing',
  [platformHost('social')]:'/social',[platformHost('space')]:'/space',[platformHost('drive')]:'/storage',
  [platformHost('work')]:'/work',[platformHost('workspace-api')]:'/workspace-api',[platformHost('marketing-api')]:'/marketing-api',
  [platformHost('marketing-connect-api')]:'/marketing-connect-api',[platformHost('marketing-publish-api')]:'/marketing-publish-api',
  [platformHost('pay')]:'/pay',[platformHost('pay.biz')]:'/ekodibiz/pay',[platformHost('live')]:'/live',[platformHost('live.biz')]:'/live/biz',
  [platformHost('live.church')]:'/live/church',[platformHost('live.lab')]:'/live/lab',[platformHost('cloud')]:'/cloud',[platformHost('trade')]:'/trade',
  [platformHost('trade.biz')]:'/ekodibiz/trade',[platformHost('biz')]:'/ekodibiz',[platformHost('church')]:'/ekodichurch',[platformHost('lab')]:'/ekodilab',
  [platformHost('mall')]:'/ekodibiz/mall',[platformHost('mall.biz')]:'/ekodibiz/mall',[platformHost('mail')]:'/mail',[platformHost('mail.biz')]:'/mail',
  [platformHost('mail.church')]:'/mail',[platformHost('mail.lab')]:'/mail',[platformHost('mail.books')]:'/mail',[platformHost('mail.trade')]:'/mail',
  [platformHost('messenger')]:'/messenger',[platformHost('invest')]:'/invest',[platformHost('tax')]:'/tax',[platformHost('cafe')]:'/cafe',
  [platformHost('marketing')]:'/ekodibiz/marketing-ai',[platformHost('cgma')]:'/cgma',[platformHost('jadam')]:'/jadam',[platformHost('pizzamaru')]:'/pizzamaru',[platformHost('yogurt')]:'/yogurt',
  [platformHost('jadam.ai')]:'/jadam/marketing',[platformHost('pizzamaru.ai')]:'/pizzamaru/marketing',[platformHost('yogurt.ai')]:'/yogurt/marketing',[platformHost('cgma.ai')]:'/cgma/marketing'
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
