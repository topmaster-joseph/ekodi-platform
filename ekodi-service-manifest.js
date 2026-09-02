import { operatingModelForService, ownedCustomerSiteFor } from './ekodi-site-policy.js';
const COMMON_USER_ACCESS_POLICY = Object.freeze({
  scope:'user-pages',
  guestMode:'guide-only',
  minimumTier:'free',
  identityProvider:'google',
  authHub:'https://auth.ekodi.kr/',
  enforcedBy:'shared-shell',
});
const COMMON_PUBLIC_ACCESS_POLICY = Object.freeze({
  ...COMMON_USER_ACCESS_POLICY,
  guestMode:'public-guide',
  enforcedBy:'service-ui-and-protected-api',
});

const SERVICES = [
  {id:'my',name:'My EKODI',shortName:'My',url:'https://my.ekodi.kr/',group:'personal',defaultSurface:'workspace',workspaceKinds:['person','business','organization','church','community','project'],capabilities:['identity','spaces','activity','account'],sso:true,targetable:false,order:10,shellIntegration:'worker-injected'},
  {id:'space',name:'운영공간',shortName:'Space',url:'https://space.ekodi.kr/',group:'work',defaultSurface:'workspace',workspaceKinds:['person','business','organization','church','community','project'],capabilities:['operating-space','workspace-identity','roles','capabilities','membership'],sso:true,targetable:true,openSso:true,order:12,state:'live',shellIntegration:'worker-injected',authMode:'client',onboardingVersion:1},
  {id:'management',name:'경영플랫폼',shortName:'경영AI',url:'https://management.ekodi.kr/',group:'business',defaultSurface:'public',workspaceKinds:['person','business','organization','community','project'],capabilities:['management','orchestration','module-selection','menu','orders','reviews'],sso:true,targetable:true,openSso:true,order:15,state:'preparing',shellIntegration:'worker-injected',authMode:'client',onboardingVersion:1},
  {id:'marketing',name:'Marketing AI',shortName:'Marketing',url:'https://marketing.ekodi.kr/',group:'business',defaultSurface:'public',workspaceKinds:['person','business','organization','church','community','project'],capabilities:['marketing','content','publishing','analytics'],sso:true,targetable:true,order:20,shellIntegration:'static-script'},
  {id:'community',name:'커뮤니티',shortName:'Community',url:'https://community.ekodi.kr/',group:'community',defaultSurface:'public',workspaceKinds:['person','community','church','organization','project'],capabilities:['community','groups','messages','events','prayer'],sso:true,targetable:true,order:30,shellIntegration:'worker-injected'},
  {id:'church',name:'에코디교회',shortName:'Church',url:'https://church.ekodi.kr/',group:'ministry',defaultSurface:'public',workspaceKinds:['church','organization','person'],capabilities:['church','worship','groups','pastoral','events'],sso:true,targetable:true,order:40,shellIntegration:'shared-proxy'},
  {id:'bible',name:'에코디 말씀대화',shortName:'말씀대화',url:'https://bible.ekodi.kr/',group:'ministry',defaultSurface:'public',workspaceKinds:['person','church','community','organization'],capabilities:['scripture','conversation','reflection','journey','practice','groups'],sso:true,targetable:true,openSso:true,order:45,state:'live',shellIntegration:'worker-injected',authMode:'client',onboardingVersion:1},
  {id:'life',name:'오늘의 질문',shortName:'인생AI',url:'https://life.ekodi.kr/',group:'life',defaultSurface:'public',workspaceKinds:['person','church','community','organization'],capabilities:['life-questions','reflection','scripture-bridge','practice','journey','community-handoff'],sso:true,targetable:true,openSso:true,order:47,state:'live',shellIntegration:'worker-injected',authMode:'client',onboardingVersion:1},
  {id:'business',name:'Business OS',shortName:'Business',url:'https://business.ekodi.kr/',group:'business',defaultSurface:'workspace',workspaceKinds:['business','organization'],capabilities:['business','operations','dashboard'],sso:true,targetable:false,order:50,shellIntegration:'worker-injected'},
  {id:'biz',name:'에코디비즈',shortName:'Biz',url:'https://biz.ekodi.kr/',group:'business',defaultSurface:'public',workspaceKinds:['business','organization'],capabilities:['business','trade','commerce'],sso:true,targetable:true,order:60,shellIntegration:'shared-proxy'},
  {id:'work',name:'EKODI Work',shortName:'Work',url:'https://work.ekodi.kr/',group:'work',defaultSurface:'public',workspaceKinds:['person','business','organization'],capabilities:['jobs','talent','recruiting'],sso:true,targetable:false,order:70,shellIntegration:'worker-injected'},
  {id:'author',name:'Creator AI',shortName:'Creator',url:'https://author.ekodi.kr/',group:'creator',defaultSurface:'workspace',workspaceKinds:['person','organization'],capabilities:['creator','writing','media'],sso:true,targetable:false,order:80,shellIntegration:'worker-injected'},
  {id:'books',name:'에코디서점',shortName:'Bookstore',url:'https://books.ekodi.kr/',group:'knowledge',defaultSurface:'public',workspaceKinds:['person','business','organization'],capabilities:['books','catalog','storefront','commerce'],sso:true,targetable:true,order:90,shellIntegration:'worker-injected'},
  {id:'publishing',name:'출판',shortName:'Publishing',url:'https://publishing.ekodi.kr/',group:'knowledge',defaultSurface:'public',workspaceKinds:['person','business','organization','church','community','project'],capabilities:['publishing','consultation','production','publishing-agency','distribution','studio'],sso:true,targetable:true,openSso:true,order:95,state:'live',shellIntegration:'worker-injected',authMode:'client',onboardingVersion:1},
  {id:'lab',name:'에코디연구소',shortName:'Lab',url:'https://lab.ekodi.kr/',group:'knowledge',defaultSurface:'public',workspaceKinds:['person','organization','project'],capabilities:['research','projects','knowledge'],sso:true,targetable:true,order:100,shellIntegration:'shared-proxy'},
  {id:'social',name:'EKODI Social',shortName:'Social',url:'https://social.ekodi.kr/',group:'community',defaultSurface:'workspace',workspaceKinds:['person','business','organization','church','community'],capabilities:['social','channels'],sso:true,targetable:true,openSso:true,order:110,shellIntegration:'worker-injected'},
  {id:'messenger',name:'EKODI Messenger',shortName:'Messenger',url:'https://messenger.ekodi.kr/',group:'communication',defaultSurface:'workspace',workspaceKinds:['person','business','organization','church','community','project'],capabilities:['messaging','ai-assist','handoff','notifications','commands'],sso:true,targetable:true,openSso:true,order:115,shellIntegration:'shared-proxy',authMode:'client',onboardingVersion:1},
  {id:'energy',name:'Energy AI',shortName:'Energy',url:'https://energy.ekodi.kr/',group:'life',defaultSurface:'workspace',workspaceKinds:['person','business','organization'],capabilities:['energy','solar','electricity'],sso:true,targetable:true,openSso:true,order:120,shellIntegration:'worker-injected'},
  {id:'cafe',name:'에코디 카페',shortName:'Cafe',url:'https://cafe.ekodi.kr/',group:'community',defaultSurface:'public',workspaceKinds:['person','community','church','organization','project'],capabilities:['place','community','culture','local','imagination'],sso:true,targetable:true,order:125,state:'preparing',shellIntegration:'static-script',onboardingVersion:1},
  {id:'mall',name:'에코디몰',shortName:'Mall',url:'https://ekodi.kr/mall',group:'business',defaultSurface:'public',workspaceKinds:['person','business','organization'],capabilities:['commerce','affiliate-curation','products'],sso:true,targetable:true,order:130,shellIntegration:'shared-proxy'},
  {id:'shop',name:'쇼핑플랫폼',shortName:'Shop',url:'https://shop.ekodi.kr/',group:'business',defaultSurface:'public',workspaceKinds:['person','business','organization','church','community'],capabilities:['commerce-platform','store-creation','multi-tenant'],sso:true,targetable:true,order:135,state:'planned',shellIntegration:'planned',onboardingVersion:1},
  {id:'delivery',name:'배달허브 AI',shortName:'배달허브',url:'https://ekodi.kr/delivery',group:'business',defaultSurface:'public',workspaceKinds:['person','business','organization','church','community','project'],capabilities:['delivery-orchestration','delivery-request','dispatch-recommendation','settlement-preview','operations-ai'],sso:true,targetable:true,openSso:true,order:137,state:'live',shellIntegration:'worker-injected',authMode:'client',onboardingVersion:1},
  {id:'trade',name:'EKODI Trade',shortName:'Trade',url:'https://trade.ekodi.kr/',group:'business',defaultSurface:'public',workspaceKinds:['business','organization'],capabilities:['trade','multi-tenant-trade','counterparties','trade-cases','documents','compliance','settlement-preview'],sso:true,targetable:true,openSso:true,order:140,state:'live',shellIntegration:'worker-injected',authMode:'client',onboardingVersion:1},
  {id:'invest',name:'EKODI Investment',shortName:'Investment',url:'https://invest.ekodi.kr/',group:'finance',defaultSurface:'workspace',workspaceKinds:['person','business','organization','project'],capabilities:['investment','research','due-diligence','ir','opportunities'],sso:true,targetable:true,order:145,shellIntegration:'shared-proxy',authMode:'client',onboardingVersion:1,transactionMode:'analysis-and-connection-only'},
  {id:'money',name:'EKODI Money',shortName:'Money',url:'https://money.ekodi.kr/',group:'finance',defaultSurface:'workspace',workspaceKinds:['person','business','organization','church','community'],capabilities:['financial-cleanup','accounts','autopay','financial-relationships','decision-support','official-handoff'],sso:true,targetable:true,openSso:true,order:147,shellIntegration:'worker-injected',authMode:'client',onboardingVersion:1,transactionMode:'human-confirmed-official-handoff'},
  {id:'pay',name:'EKODI Pay',shortName:'Pay',url:'https://pay.ekodi.kr/',group:'finance',defaultSurface:'public',workspaceKinds:['person','business','organization'],capabilities:['payments','billing'],sso:true,targetable:true,order:150,shellIntegration:'worker-injected'},
  {id:'edu',name:'EKODI Education',shortName:'Education',url:'https://edu.ekodi.kr/',group:'knowledge',defaultSurface:'public',workspaceKinds:['person','church','community','organization'],capabilities:['education','courses','learning','admission','study','official-sources','planning'],sso:true,targetable:true,openSso:true,order:160,shellIntegration:'worker-injected',authMode:'client',onboardingVersion:1},
  {id:'support',name:'Support Opportunity AI',shortName:'Support',url:'https://support.ekodi.kr/',group:'business',defaultSurface:'workspace',workspaceKinds:['person','business','organization','church','community','project'],capabilities:['government-support','opportunities','grants','official-sources','forms','project-lifecycle'],sso:true,targetable:true,openSso:true,order:165,state:'live',shellIntegration:'worker-injected',authMode:'client',onboardingVersion:1},
  {id:'media',name:'에코디미디어',shortName:'Media',url:'https://media.ekodi.kr/',group:'creator',defaultSurface:'public',workspaceKinds:['person','church','community','organization'],capabilities:['media','video','live'],sso:true,targetable:true,order:170,state:'planned',shellIntegration:'planned'},
  {id:'insurance',name:'에코디보험',shortName:'Insurance',url:'https://ins.ekodi.kr/',group:'life',defaultSurface:'public',workspaceKinds:['person','business','organization'],capabilities:['insurance','coverage','claims'],sso:true,targetable:true,order:180,state:'planned',shellIntegration:'planned'},
  {id:'mail',name:'EKODI Mail',shortName:'Mail',url:'https://mail.ekodi.kr/',group:'communication',defaultSurface:'workspace',workspaceKinds:['person','business','organization','church','community'],capabilities:['mail','communication'],sso:true,targetable:true,order:190,state:'planned',shellIntegration:'planned'},
  {id:'live',name:'EKODI Live',shortName:'Live',url:'https://live.ekodi.kr/',group:'communication',defaultSurface:'workspace',workspaceKinds:['person','business','organization','church','community'],capabilities:['live','broadcast'],sso:true,targetable:true,order:200,state:'planned',shellIntegration:'planned'},
  {id:'cloud',name:'EKODI Cloud',shortName:'Cloud',url:'https://cloud.ekodi.kr/',group:'communication',defaultSurface:'workspace',workspaceKinds:['person','business','organization','church','community','project'],capabilities:['files','collaboration','cloud'],sso:true,targetable:true,order:210,state:'planned',shellIntegration:'planned'}
].map(service=>{
  const ownedSite=ownedCustomerSiteFor(service.id);
  const operatingModel=operatingModelForService(service.id);
  const userAccessPolicy=operatingModel==='customer-site'?null:(service.defaultSurface==='public'?COMMON_PUBLIC_ACCESS_POLICY:COMMON_USER_ACCESS_POLICY);
  return Object.freeze({...service,operatingModel,userAccessPolicy,tenantSlug:ownedSite?.slug||null,defaultActivityRole:ownedSite?.defaultActivityRole||null,defaultActivityRoleLabel:ownedSite?.defaultActivityRoleLabel||null});
});

const canonicalPath=value=>{
  const path=String(value||'/').replace(/\/+$/,'');
  return path||'/';
};
const canonicalKey=value=>{
  const url=value instanceof URL?value:new URL(value);
  return `${url.origin}${canonicalPath(url.pathname)}`;
};

export const EKODI_SERVICE_MANIFEST = Object.freeze({
  version: 18,
  updatedAt: '2026-09-02',
  identityModel: 'person-space-role',
  authorityModel: 'platform-admin-is-separate-from-tenant-activity',
  shellVersion: 2,
  shellPolicy: 'required-for-user-facing-services',
  onboardingPolicyVersion: 1,
  userAccessPolicy: 'public-guide-workspace-member-content',
  services: Object.freeze(SERVICES)
});
export const EKODI_SERVICE_BY_ID = new Map(EKODI_SERVICE_MANIFEST.services.map(service=>[service.id,service]));
export const EKODI_SERVICE_BY_URL = new Map(EKODI_SERVICE_MANIFEST.services.map(service=>[canonicalKey(service.url),service]));
export const EKODI_SERVICES_BY_HOST = new Map();
for(const service of EKODI_SERVICE_MANIFEST.services){
  const host=new URL(service.url).hostname;
  const list=EKODI_SERVICES_BY_HOST.get(host)||[];
  list.push(service);
  EKODI_SERVICES_BY_HOST.set(host,list);
}
for(const list of EKODI_SERVICES_BY_HOST.values())list.sort((a,b)=>canonicalPath(new URL(b.url).pathname).length-canonicalPath(new URL(a.url).pathname).length);
export function serviceForHost(hostname){
  const list=EKODI_SERVICES_BY_HOST.get(String(hostname||'').toLowerCase())||[];
  if(list.length===1)return list[0];
  return list.find(service=>canonicalPath(new URL(service.url).pathname)==='/')||null;
}
export function serviceForUrl(value){
  let url;
  try{url=value instanceof URL?value:new URL(String(value||''));}catch{return null;}
  const path=canonicalPath(url.pathname);
  const list=EKODI_SERVICES_BY_HOST.get(url.hostname.toLowerCase())||[];
  return list.find(service=>{
    const base=canonicalPath(new URL(service.url).pathname);
    return base==='/'?path==='/':path===base||path.startsWith(`${base}/`);
  })||null;
}
export function serviceForId(id){return EKODI_SERVICE_BY_ID.get(String(id||'').toLowerCase())||null;}