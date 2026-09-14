const TENANTS = Object.freeze([
  {id:'ekodi-church',apiTenant:'ekodichurch',aliases:['ekodichurch','church'],name:'\uC5D0\uCF54\uB514\uAD50\uD68C',path:'/ekodichurch/live/',home:'/ekodichurch/',mode:'worship',title:'\uC5D0\uCF54\uB514\uAD50\uD68C \uC2E4\uC2DC\uAC04 \uC608\uBC30',authSite:'church',dedicated:true},
  {id:'ekodi-biz',apiTenant:'ekodi-biz',aliases:['ekodibiz','biz'],name:'\uC5D0\uCF54\uB514\uBE44\uC988',path:'/ekodibiz/live/',home:'/ekodibiz/',mode:'public_broadcast',title:'\uC5D0\uCF54\uB514\uBE44\uC988 LIVE',authSite:'biz'},
  {id:'ekodi-lab',apiTenant:'ekodi-lab',aliases:['ekodilab','lab'],name:'\uC5D0\uCF54\uB514\uC5F0\uAD6C\uC18C',path:'/ekodilab/live/',home:'/ekodilab/',mode:'education',title:'\uC5D0\uCF54\uB514\uC5F0\uAD6C\uC18C LIVE',authSite:'lab'},
  {id:'cgma',apiTenant:'cgma',aliases:['cheonggye'],name:'\uCCAD\uACC4\uBA74\uC0C1\uC778\uD68C',path:'/cgma/live/',home:'/cgma/',mode:'meeting',title:'\uCCAD\uACC4\uBA74\uC0C1\uC778\uD68C LIVE',authSite:'cgma'},
  {id:'mokdaehumun',apiTenant:'mokdaehumun',aliases:['mokpo-backgate'],name:'\uBAA9\uB300\uD6C4\uBB38 \uC790\uC728\uC0C1\uAD8C\uC870\uD569',path:'/mokdaehumun/live/',home:'/mokdaehumun/',mode:'meeting',title:'\uBAA9\uB300\uD6C4\uBB38 \uC790\uC728\uC0C1\uAD8C\uC870\uD569 LIVE',authSite:'mokdaehumun'},
  {id:'jadam',apiTenant:'jadam',aliases:[],name:'\uC790\uB2F4\uCE58\uD0A8 \uBAA9\uD3EC\uB300\uC810',path:'/jadam/live/',home:'/jadam/',mode:'commerce',title:'\uC790\uB2F4\uCE58\uD0A8 LIVE',authSite:'jadam'},
  {id:'pizzamaru',apiTenant:'pizzamaru',aliases:[],name:'\uD53C\uC790\uB9C8\uB8E8 \uBAA9\uD3EC\uB300\uC810',path:'/pizzamaru/live/',home:'/pizzamaru/',mode:'commerce',title:'\uD53C\uC790\uB9C8\uB8E8 LIVE',authSite:'pizzamaru'},
  {id:'yogurt',apiTenant:'yogurt',aliases:[],name:'\uC694\uAC70\uD2B8\uD37C\uD50C \uBAA9\uD3EC\uB300\uC810',path:'/yogurt/live/',home:'/yogurt/',mode:'commerce',title:'\uC694\uAC70\uD2B8\uD37C\uD50C LIVE',authSite:'yogurt'},
  {id:'ekodimall',apiTenant:'ekodimall',aliases:['mall'],name:'\uC5D0\uCF54\uB514\uBAB0',path:'/ekodibiz/ekodimall/live/',home:'/ekodibiz/ekodimall/',mode:'commerce',title:'\uC5D0\uCF54\uB514\uBAB0 LIVE',authSite:'mall'},
  {id:'ekoditrade',apiTenant:'ekoditrade',aliases:['trade','ekodi-trade'],name:'\uC5D0\uCF54\uB514\uBB34\uC5ED',path:'/ekodibiz/trade/live/',home:'/ekodibiz/trade/',mode:'meeting',title:'\uC5D0\uCF54\uB514\uBB34\uC5ED LIVE',authSite:'trade'},
]);

const lookup = new Map();
for (const tenant of TENANTS) {
  for (const key of [tenant.id, tenant.apiTenant, ...tenant.aliases]) lookup.set(String(key).toLowerCase(), tenant);
}

export function realtimeTenant(value='') {
  return lookup.get(String(value||'').trim().toLowerCase()) || null;
}
export function realtimeTenantFromPath(pathname='') {
  const path=String(pathname||'');
  return TENANTS.find(tenant=>path===tenant.path||path===tenant.path.slice(0,-1)||path===`${tenant.path}index.html`)||null;
}
export function realtimeTenantAliases(value='') {
  const tenant=realtimeTenant(value);return tenant?new Set([tenant.id,tenant.apiTenant,...tenant.aliases]):new Set();
}
export function realtimeTenantList(){return TENANTS.map(tenant=>({...tenant,aliases:[...tenant.aliases]}));}
export const REALTIME_TENANT_REGISTRY=TENANTS;
