export const MANAGED_LANGUAGE_SITES=Object.freeze([
  Object.freeze({
    id:'cgma',name:'청계면상인회',url:'https://ekodi.kr/cgma/',defaultSurface:'public',state:'live',
    shellIntegration:'static-script',translationAutomation:false,
    authority:Object.freeze({provider:'supabase-access-api',siteKey:'cgma',tenantSlug:'cheonggye'}),
    nativeReadyLocales:Object.freeze(['ko-KR','en'])
  })
]);

const SITE_KEYS=Object.freeze([
  'my','space','management','marketing','community','church','bible','life','business','biz','work','author','books','publishing','journal','lab','social','messenger','energy','cafe','mall','shop','delivery','trade','invest','money','pay','edu','learn','support','media','insurance','mail','live','cloud'
]);
export const LANGUAGE_ADMIN_AUTHORITIES=Object.freeze(Object.fromEntries([
  ['cgma',Object.freeze({provider:'supabase-access-api',siteKey:'cgma',tenantSlug:'cheonggye'})],
  ['biz',Object.freeze({provider:'supabase-access-api',siteKey:'biz',tenantSlug:'ekodibiz'})],
  ...SITE_KEYS.filter(id=>id!=='biz').map(id=>[id,Object.freeze({provider:'supabase-access-api',siteKey:id,tenantSlug:''})])
]));

const BY_ID=new Map(MANAGED_LANGUAGE_SITES.map(site=>[site.id,site]));
export function managedLanguageSiteForId(id){
  const key=String(id||'').trim().toLowerCase(),site=BY_ID.get(key),authority=LANGUAGE_ADMIN_AUTHORITIES[key];
  return site||authority?Object.freeze({...site,id:key,authority:authority||site.authority}):null;
}
export function managedLanguageSiteIds(){return Object.freeze(MANAGED_LANGUAGE_SITES.map(site=>site.id));}
