export const PLATFORM_ROUTE_REGISTRY=Object.freeze({
  canonical:Object.freeze(['admin','my','auth','api','mcp','webhooks','health']),
  platformServices:Object.freeze([
    'bible','books','business','cafe','community','cmpmyi','dev','education','energy','event','experience','give','history','insurance','invest','journal','lab','life','live','login','logout','mail','mall','marketing','media','messenger','mission','money','pay','preview','privacy','publish','social','status','stores','support','tax','terms','trade','try','work','www'
  ]),
  retiredIdentityPrefixes:Object.freeze(['group','org','personal','project','space','user']),
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
