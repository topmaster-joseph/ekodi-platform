(()=>{
'use strict';
const VERSION=2;
const ROOT_MARKER='data-ekodi-public-admin';
const ACTIVE_CLASS='ekodi-public-admin-active';
const DRAWER_OPEN_CLASS='ekodi-public-admin-drawer-open';

const clean=value=>String(value||'').trim();
const sameOriginUrl=(value,fallback='/admin/')=>{
  const url=new URL(clean(value)||fallback,location.origin);
  if(url.origin!==location.origin)throw new Error('cross_origin_admin_target_forbidden');
  return url;
};
const safeParams=value=>{
  const out={};
  if(!value||typeof value!=='object')return out;
  for(const [key,raw] of Object.entries(value)){
    const name=clean(key);
    if(!name||raw===undefined||raw===null||raw==='')continue;
    out[name]=String(raw);
  }
  return out;
};
const capabilityMap=(principal,selector)=>{
  const raw=typeof selector==='function'?selector(principal):principal?.permissions;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return Object.freeze({});
  return Object.freeze(Object.fromEntries(Object.entries(raw).map(([key,value])=>[clean(key),value===true])));
};
const emit=(name,detail)=>window.dispatchEvent(new CustomEvent(name,{detail}));

function create(options={}){
  const serviceId=clean(options.serviceId)||clean(document.documentElement.dataset.ekodiService)||'service';
  const adminBase=sameOriginUrl(options.adminPath||'/admin/');
  const permissionSelector=options.permissionSelector;
  let principal=null;
  let permissions=Object.freeze({});
  let drawer=null;

  function has(permission){
    const key=clean(permission);
    return Boolean(key&&permissions[key]===true);
  }

  function close(){
    if(!drawer)return;
    drawer.hidden=true;
    const frame=drawer.querySelector('[data-ekodi-public-admin-frame]');
    if(frame)frame.src='about:blank';
    document.body?.classList.remove(DRAWER_OPEN_CLASS);
    emit('ekodi:public-admin-close',{serviceId});
  }

  function ensureDrawer(){
    if(drawer?.isConnected)return drawer;
    const existing=document.querySelector('[data-ekodi-public-admin-drawer="'+CSS.escape(serviceId)+'"]');
    if(existing){drawer=existing;return drawer;}
    drawer=document.createElement('aside');
    drawer.className='ekodi-public-admin-drawer';
    drawer.hidden=true;
    drawer.dataset.ekodiPublicAdminDrawer=serviceId;
    drawer.setAttribute('aria-label','관리자 빠른 편집');
    drawer.innerHTML='<div class="ekodi-public-admin-drawer__head"><div><small>ADMIN QUICK EDIT</small><strong data-ekodi-public-admin-title>관리자 편집</strong></div><button type="button" data-ekodi-public-admin-close aria-label="관리자 편집 닫기">닫기</button></div><iframe data-ekodi-public-admin-frame title="관리자 빠른 편집" loading="eager"></iframe>';
    document.body.append(drawer);
    drawer.querySelector('[data-ekodi-public-admin-close]')?.addEventListener('click',close);
    return drawer;
  }

  function open(panel,label,params={},presentation='drawer'){
    const panelId=clean(panel);
    if(!panelId)return null;
    const url=sameOriginUrl(adminBase.href);
    url.searchParams.set('panel',panelId);
    for(const [key,value] of Object.entries(safeParams(typeof params==='function'?params():params)))url.searchParams.set(key,value);
    const mode=clean(presentation).toLowerCase()==='window'?'window':'drawer';
    if(mode==='window'){
      const popup=window.open(url.pathname+url.search+url.hash,'_blank','noopener,noreferrer');
      emit('ekodi:public-admin-open',{serviceId,panel:panelId,presentation:mode});
      return popup;
    }
    const host=ensureDrawer();
    const frame=host.querySelector('[data-ekodi-public-admin-frame]');
    const title=host.querySelector('[data-ekodi-public-admin-title]');
    if(title)title.textContent=clean(label)||'관리자 편집';
    if(frame)frame.src=url.pathname+url.search+url.hash;
    host.hidden=false;
    document.body?.classList.add(DRAWER_OPEN_CLASS);
    emit('ekodi:public-admin-open',{serviceId,panel:panelId,presentation:mode});
    return host;
  }

  function attach(target,descriptor={}){
    if(!target||!target.append)return null;
    const permission=clean(descriptor.permission);
    const panel=clean(descriptor.panel);
    if(!permission||!panel||!has(permission))return null;
    const selector='[data-ekodi-public-admin-panel="'+CSS.escape(panel)+'"]';
    if(target.querySelector?.(selector))return target.querySelector(selector);
    const button=document.createElement('button');
    button.type='button';
    button.className='ekodi-public-admin-inline';
    button.dataset.ekodiPublicAdminPanel=panel;
    button.dataset.ekodiPublicAdminPermission=permission;
    button.textContent=clean(descriptor.label)||'관리';
    button.setAttribute('aria-label',clean(descriptor.ariaLabel)||button.textContent);
    button.dataset.ekodiPublicAdminPresentation=clean(descriptor.presentation)||'drawer';
    button.addEventListener('click',()=>open(panel,descriptor.label,descriptor.params||{},descriptor.presentation||'drawer'));
    if(descriptor.prepend===true&&target.prepend)target.prepend(button);else target.append(button);
    return button;
  }

  async function authorize(config={}){
    const endpoint=sameOriginUrl(config.endpoint||options.authEndpoint||'/api/admin/me','/api/admin/me');
    const tokenProvider=config.tokenProvider||options.tokenProvider;
    if(typeof tokenProvider!=='function')return null;
    const bearer=clean(await tokenProvider());
    if(!bearer)return null;
    const headers=new Headers(config.headers||{});
    headers.set('authorization','Bearer '+bearer);
    const response=await fetch(endpoint.pathname+endpoint.search,{
      method:'GET',
      headers,
      cache:'no-store',
      credentials:'same-origin',
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data?.ok===false)return null;
    const nextPermissions=capabilityMap(data,permissionSelector);
    if(!Object.values(nextPermissions).some(Boolean))return null;
    principal=data;
    permissions=nextPermissions;
    document.documentElement.setAttribute(ROOT_MARKER,'v'+VERSION);
    document.documentElement.dataset.ekodiPublicAdminService=serviceId;
    document.body?.classList.add(ACTIVE_CLASS);
    emit('ekodi:public-admin-ready',{serviceId,permissions:{...permissions}});
    return data;
  }

  function reset(){
    principal=null;
    permissions=Object.freeze({});
    close();
    document.body?.classList.remove(ACTIVE_CLASS);
    if(document.documentElement.dataset.ekodiPublicAdminService===serviceId){
      document.documentElement.removeAttribute(ROOT_MARKER);
      delete document.documentElement.dataset.ekodiPublicAdminService;
    }
  }

  return Object.freeze({
    version:VERSION,
    serviceId,
    authorize,
    attach,
    open,
    close,
    reset,
    has,
    principal:()=>principal,
    permissions:()=>({...permissions}),
  });
}

window.EKODIPublicSurfaceAdmin=Object.freeze({version:VERSION,create});
})();