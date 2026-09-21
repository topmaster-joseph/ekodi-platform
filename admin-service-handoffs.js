import {
  ADMIN_SERVICE_CATALOG,
  ADMIN_SERVICE_GROUPS,
  canonicalServiceAdminUrl,
  canonicalServiceUrl,
  getAdminService,
} from './admin-service-catalog.js';

const LEGACY_DOMAIN_IDS=Object.freeze({
  'church.ekodi.kr':'church',
  'biz.ekodi.kr':'biz',
  'business.ekodi.kr':'business',
  'books.ekodi.kr':'books',
  'author.ekodi.kr':'author',
  'lab.ekodi.kr':'lab',
  'edu.ekodi.kr':'education',
  'community.ekodi.kr':'community',
  'social.ekodi.kr':'social',
  'ekodi.kr/ekodimall':'mall',
  'marketing.ekodi.kr':'marketing',
  'trade.ekodi.kr':'trade',
  'pay.ekodi.kr':'pay',
  'work.ekodi.kr':'work',
  'energy.ekodi.kr':'energy',
  'ekodi.kr/insurance':'insurance',
  'mail.ekodi.kr':'mail',
  'live.ekodi.kr':'live',
  'cgma.ekodi.kr':'cgma',
  'jadam.ekodi.kr':'jadam',
  'pizzamaru.ekodi.kr':'pizzamaru',
  'yogurt.ekodi.kr':'yogurt',
});

function normalizeSurface(value){
  const raw=String(value||'').trim().toLowerCase().replace(/^https?:\/\//,'').split(/[?#]/)[0].replace(/\/+$/,'');
  return raw;
}

function descriptorForRow(row){
  const id=String(row?.dataset?.siteId||'').trim().toLowerCase();
  if(id){const direct=getAdminService(id);if(direct)return direct}
  const domain=normalizeSurface(row?.dataset?.siteDomain);
  const aliasId=LEGACY_DOMAIN_IDS[domain];
  if(aliasId)return getAdminService(aliasId);
  if(domain.startsWith('ekodi.kr/')){
    const path=`/${domain.slice('ekodi.kr/'.length)}`;
    return ADMIN_SERVICE_CATALOG.find(item=>item.basePath===path)||null;
  }
  return null;
}

function installStyles(){
  if(document.querySelector('style[data-ekodi-admin-service-handoffs]'))return;
  const style=document.createElement('style');
  style.dataset.ekodiAdminServiceHandoffs='1';
  style.textContent=`
    .ekodi-service-admin-menu{margin:12px 0 18px;border:1px solid var(--line,#d9dee7);border-radius:16px;background:var(--card,#fff);overflow:hidden}
    .ekodi-service-admin-menu summary{cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;font-weight:700;list-style:none}
    .ekodi-service-admin-menu summary::-webkit-details-marker{display:none}
    .ekodi-service-admin-menu summary small{font-weight:500;opacity:.62}
    .ekodi-service-admin-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;padding:0 14px 14px}
    .ekodi-service-admin-group{border-top:1px solid var(--line,#e7eaf0);padding-top:10px}
    .ekodi-service-admin-group h4{margin:0 0 7px;font-size:.78rem;opacity:.68}
    .ekodi-service-admin-links{display:flex;flex-wrap:wrap;gap:7px}
    .ekodi-service-admin-link{display:inline-flex;align-items:center;min-height:34px;padding:7px 10px;border:1px solid var(--line,#d9dee7);border-radius:10px;text-decoration:none;color:inherit;background:transparent;font-size:.88rem}
    .ekodi-service-admin-link:hover,.ekodi-service-admin-link:focus-visible{border-color:currentColor}
    .campus-site-identity strong>a[data-service-admin-name]{color:inherit;text-decoration:none}
    .campus-site-identity strong>a[data-service-admin-name]:hover,.campus-site-identity strong>a[data-service-admin-name]:focus-visible{text-decoration:underline}
  `;
  document.head.append(style);
}

function mountQuickMenu(){
  if(document.querySelector('#ekodiServiceAdminMenu'))return true;
  const panel=document.querySelector('#campusPanel');
  const toolbar=panel?.querySelector('.campus-toolbar');
  if(!panel||!toolbar)return false;
  const details=document.createElement('details');
  details.id='ekodiServiceAdminMenu';
  details.className='ekodi-service-admin-menu';
  const summary=document.createElement('summary');
  const title=document.createElement('span');title.textContent='서비스 관리자';
  const count=document.createElement('small');count.textContent=`${ADMIN_SERVICE_CATALOG.length}개 · 이름을 눌러 관리`;
  summary.append(title,count);
  const groups=document.createElement('div');groups.className='ekodi-service-admin-groups';
  for(const group of ADMIN_SERVICE_GROUPS){
    const items=ADMIN_SERVICE_CATALOG.filter(item=>item.group===group.id);
    if(!items.length)continue;
    const section=document.createElement('section');section.className='ekodi-service-admin-group';
    const heading=document.createElement('h4');heading.textContent=group.label;
    const links=document.createElement('div');links.className='ekodi-service-admin-links';
    for(const item of items){
      const link=document.createElement('a');
      link.className='ekodi-service-admin-link';
      link.href=canonicalServiceAdminUrl(item.basePath);
      link.textContent=item.name;
      link.dataset.serviceAdminId=item.id;
      link.setAttribute('aria-label',`${item.name} 관리자 열기`);
      links.append(link);
    }
    section.append(heading,links);groups.append(section);
  }
  details.append(summary,groups);
  toolbar.insertAdjacentElement('afterend',details);
  return true;
}

function upgradeCampusRow(row){
  if(!row||row.dataset.serviceAdminHandoff==='ready')return;
  const descriptor=descriptorForRow(row);
  const legacy=normalizeSurface(row.dataset.siteDomain);
  if(!descriptor){
    if(legacy==='my.ekodi.kr')row.hidden=true;
    return;
  }
  const publicUrl=canonicalServiceUrl(descriptor.basePath);
  const adminUrl=canonicalServiceAdminUrl(descriptor.basePath);
  row.dataset.siteId=descriptor.id;
  row.dataset.siteDomain=`ekodi.kr${descriptor.basePath}`;
  row.dataset.serviceAdminUrl=adminUrl;
  row.dataset.serviceAdminHandoff='ready';

  const domain=row.querySelector('.campus-site-domain');
  if(domain){
    domain.textContent=`ekodi.kr${descriptor.basePath}`;
    if(domain.tagName==='A'){domain.href=publicUrl;domain.target='_blank';domain.rel='noopener'}
  }

  const strong=row.querySelector('.campus-site-identity strong');
  if(strong&&!strong.querySelector('[data-service-admin-name]')){
    const link=document.createElement('a');
    link.href=adminUrl;
    link.dataset.serviceAdminName='true';
    link.textContent=strong.textContent||descriptor.name;
    link.setAttribute('aria-label',`${descriptor.name} 관리자 열기`);
    strong.replaceChildren(link);
  }

  const manage=row.querySelector('[data-campus-action="manage"]');
  if(manage){
    manage.dataset.serviceAdminHandoff='true';
    manage.dataset.serviceAdminUrl=adminUrl;
    manage.textContent='관리 ↗';
    manage.setAttribute('aria-label',`${descriptor.name} 관리자 열기`);
  }
}

function reconcile(){
  mountQuickMenu();
  document.querySelectorAll('#campusSiteGroups .campus-site-item').forEach(upgradeCampusRow);
}

function install(){
  installStyles();
  reconcile();
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-campus-action="manage"][data-service-admin-handoff="true"]');
    if(!button)return;
    const url=button.dataset.serviceAdminUrl;
    if(!url)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(url);
  },true);
  const observer=new MutationObserver(reconcile);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('ekodi-campus-registry-reconciled',reconcile);
  window.addEventListener('ekodi-admin-ready',reconcile);
}

if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
}

export const EKODI_ADMIN_SERVICE_HANDOFFS=Object.freeze({catalog:ADMIN_SERVICE_CATALOG});
