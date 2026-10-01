(() => {
  'use strict';
  const SECTION='site-health';
  const TOKEN_KEY='ekodi-auth-token';
  const API='https://ekodi.kr';
  const BUILTIN=[
    {id:'root',name:'EKODI',url:'https://ekodi.kr/',label:'ekodi.kr',status:'live',productionVerified:true,source:'core'},
    {id:'admin',name:'EKODI Admin',url:'https://ekodi.kr/admin/',label:'ekodi.kr/admin',status:'live',productionVerified:true,source:'core'},
    {id:'auth',name:'EKODI Auth',url:'https://ekodi.kr/auth/',label:'ekodi.kr/auth',status:'live',productionVerified:true,source:'core'},
    {id:'seonammedi',name:'서남권 국립의대 소통센터',url:'https://ekodi.kr/seonammedi/',label:'ekodi.kr/seonammedi',status:'live',productionVerified:true,source:'workspace'}
  ];
  let catalog=[],overview=null,active='dynamic',loading=false;
  const token=()=>{try{return sessionStorage.getItem(TOKEN_KEY)||''}catch{return''}};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const headers=()=>token()?{authorization:`Bearer ${token()}`}:{};
  const normalizeUrl=value=>{try{const u=new URL(String(value||''),location.origin);return u.href}catch{return String(value||'')}};
  const keyOf=value=>{try{const u=new URL(normalizeUrl(value));return (u.hostname+u.pathname.replace(/\/+$/,'')).toLowerCase()}catch{return String(value||'').toLowerCase()}};

  function panel(){return document.getElementById('ekodiGlobalSiteHealth')}
  function ensurePanel(){
    if(panel())return panel();
    const host=document.querySelector('.content'); if(!host)return null;
    const section=document.createElement('section');
    section.id='ekodiGlobalSiteHealth';
    section.className='section site-health-admin hidden-panel';
    section.dataset.panel=SECTION;
    section.innerHTML=`
      <div class="site-health-head">
        <div><p class="kicker">ALL SITES · HEALTH CHECK</p><h2>사이트 자동점검</h2><p>개별 사이트 관리자에서 분리해 최고관리자가 전체 사이트의 배포·구성 상태와 실시간 운영 상태를 한곳에서 확인합니다.</p></div>
        <div class="site-health-actions"><button type="button" class="secondary" data-site-health-refresh>↻ 새로고침</button><button type="button" class="primary" data-site-health-run>동적상태 재점검</button></div>
      </div>
      <div class="site-health-tabs" role="tablist" aria-label="사이트 점검 상태 구분">
        <button type="button" role="tab" data-site-health-tab="dynamic" aria-selected="true">동적상태</button>
        <button type="button" role="tab" data-site-health-tab="static" aria-selected="false">정적상태</button>
      </div>
      <div class="site-health-summary" data-site-health-summary></div>
      <div class="site-health-toolbar"><input type="search" data-site-health-search placeholder="사이트·주소 검색" aria-label="사이트 검색"><span data-site-health-meta>불러오는 중</span></div>
      <div class="site-health-list" data-site-health-list><p class="site-health-empty">전체 사이트 상태를 불러오는 중입니다.</p></div>`;
    host.prepend(section);
    section.querySelectorAll('[data-site-health-tab]').forEach(btn=>btn.addEventListener('click',()=>{active=btn.dataset.siteHealthTab;syncTabs();render()}));
    section.querySelector('[data-site-health-refresh]')?.addEventListener('click',()=>load(false));
    section.querySelector('[data-site-health-run]')?.addEventListener('click',()=>load(true));
    section.querySelector('[data-site-health-search]')?.addEventListener('input',render);
    return section;
  }
  function syncTabs(){
    const root=panel(); if(!root)return;
    root.querySelectorAll('[data-site-health-tab]').forEach(btn=>btn.setAttribute('aria-selected',String(btn.dataset.siteHealthTab===active)));
    const run=root.querySelector('[data-site-health-run]'); if(run)run.hidden=active!=='dynamic';
  }
  function customerSites(data){
    const rows=[];
    const push=x=>{
      const url=x?.canonicalUrl||x?.url||x?.public_url||x?.publicUrl||x?.site_url||x?.siteUrl||'';
      if(!url)return;
      rows.push({id:x.id||x.slug||keyOf(url),name:x.name||x.site_name||x.siteName||x.organization_name||x.organizationName||x.slug||url,url,label:x.label||keyOf(url),status:x.status||x.lifecycle||x.migrationState||'live',productionVerified:x.productionVerified??true,source:'workspace'});
    };
    const candidates=[data?.sites,data?.customers,data?.workspaces,data?.items,data?.directory];
    for(const list of candidates)if(Array.isArray(list))list.forEach(push);
    return rows;
  }
  function mergeCatalog(...groups){
    const map=new Map();
    for(const item of groups.flat()){
      if(!item?.url)continue;
      const key=keyOf(item.url);
      const prev=map.get(key)||{};
      map.set(key,{...prev,...item,url:normalizeUrl(item.url),label:item.label||prev.label||key});
    }
    return [...map.values()].sort((a,b)=>String(a.name||a.label).localeCompare(String(b.name||b.label),'ko-KR'));
  }
  async function fetchJson(path,options={}){
    const res=await fetch(path,{cache:'no-store',...options,headers:{...headers(),...(options.headers||{})}});
    if(!res.ok)throw new Error(`${path} ${res.status}`);
    return res.json();
  }
  async function load(force=false){
    if(loading)return;loading=true;
    const root=ensurePanel(); const refresh=root?.querySelector('[data-site-health-refresh]'); const run=root?.querySelector('[data-site-health-run]');
    if(refresh)refresh.disabled=true;if(run)run.disabled=true;
    try{
      const [registry,customers,live]=await Promise.all([
        fetch('/ecosystem-services.json',{cache:'no-store'}).then(r=>r.ok?r.json():({services:[]})).catch(()=>({services:[]})),
        fetchJson('/api/customers/directory').catch(()=>({})),
        fetchJson(force?'/api/control/check':'/api/control/overview',{method:force?'POST':'GET'}).catch(error=>({error:String(error?.message||error),services:[]}))
      ]);
      const services=(registry?.services||[]).map(x=>({...x,source:'service'}));
      catalog=mergeCatalog(BUILTIN,services,customerSites(customers));
      overview=live;
      render();
    }finally{
      loading=false;if(refresh)refresh.disabled=false;if(run)run.disabled=false;
    }
  }
  function dynamicRows(){
    const live=new Map((overview?.services||[]).filter(x=>x?.domain).map(x=>[String(x.domain).toLowerCase(),x]));
    const rows=[];const used=new Set();
    for(const item of catalog){
      const url=new URL(item.url);const keys=[url.hostname.toLowerCase(),keyOf(item.url)];
      let service=null;
      for(const key of keys){if(live.has(key)){service=live.get(key);used.add(key);break}}
      if(!service){
        const lifecycle=String(item.status||'').toLowerCase();
        rows.push({...item,tone:['planned','preparing'].includes(lifecycle)?'muted':'pending',state:['planned','preparing'].includes(lifecycle)?'점검 제외':'연결대기',detail:['planned','preparing'].includes(lifecycle)?'아직 운영 대상이 아닌 정적 등록 상태':'Control API 실시간 점검 연결 대기',response:'—'});
        continue;
      }
      const status=service.latest?.status||'pending'; const response=Number(service.latest?.responseTime??service.stats24h?.averageResponseTime??0);
      const tone=status==='offline'?'bad':status==='degraded'||response>=1800?'warn':'ok';
      const state=tone==='bad'?'장애':tone==='warn'?'주의':'정상';
      rows.push({...item,tone,state,detail:service.latest?.error||`최근 응답 ${response?response+'ms':'정상'}`,response:response?response+' ms':'—',checked:service.latest?.checkedAt||service.latest?.checked_at||overview?.generatedAt});
    }
    for(const service of overview?.services||[]){
      const key=String(service.domain||'').toLowerCase();if(!key||used.has(key)||rows.some(x=>keyOf(x.url)===key))continue;
      const status=service.latest?.status||'pending';const response=Number(service.latest?.responseTime??0);const tone=status==='offline'?'bad':status==='degraded'||response>=1800?'warn':'ok';
      rows.push({name:service.name||service.domain,label:service.domain,url:`https://${service.domain}`,tone,state:tone==='bad'?'장애':tone==='warn'?'주의':'정상',detail:service.latest?.error||'Control API 등록 서비스',response:response?response+' ms':'—',checked:service.latest?.checkedAt||overview?.generatedAt,source:'control'});
    }
    return rows;
  }
  function staticRows(){
    return catalog.map(item=>{
      const status=String(item.status||'unknown').toLowerCase();
      const path=new URL(item.url).pathname.replace(/\/+$/,'')||'/';
      const verified=item.productionVerified===true;
      let tone='ok',state='정상',detail='중앙 레지스트리 등록 · canonical 경로 확인';
      if(['planned','preparing'].includes(status)){tone='muted';state='준비중';detail='정식 운영 전 레지스트리 상태'}
      else if(!verified && status==='live'){tone='warn';state='확인필요';detail='Live 표기지만 productionVerified 확인 필요'}
      return {...item,tone,state,detail:`${detail} · ${status} · ${path}`,response:item.source==='workspace'?'Workspace':item.source==='core'?'Core':'Service registry'};
    });
  }
  function render(){
    const root=ensurePanel();if(!root)return;syncTabs();
    const query=String(root.querySelector('[data-site-health-search]')?.value||'').trim().toLowerCase();
    const all=active==='dynamic'?dynamicRows():staticRows();
    const rows=all.filter(x=>!query||`${x.name} ${x.label} ${x.url}`.toLowerCase().includes(query));
    const counts={ok:all.filter(x=>x.tone==='ok').length,warn:all.filter(x=>x.tone==='warn').length,bad:all.filter(x=>x.tone==='bad').length,pending:all.filter(x=>['pending','muted'].includes(x.tone)).length};
    root.querySelector('[data-site-health-summary]').innerHTML=[
      ['전체',all.length,''],['정상',counts.ok,'ok'],['주의',counts.warn,'warn'],['장애',counts.bad,'bad'],[active==='dynamic'?'대기·제외':'준비중',counts.pending,'muted']
    ].map(([label,value,tone])=>`<article class="${tone}"><span>${label}</span><strong>${value}</strong></article>`).join('');
    const meta=root.querySelector('[data-site-health-meta]');if(meta)meta.textContent=active==='dynamic'
      ?`동적상태 · ${overview?.generatedAt?new Date(overview.generatedAt).toLocaleString('ko-KR'):'실시간 집계'}`
      :`정적상태 · 중앙 레지스트리 ${catalog.length}개`;
    const host=root.querySelector('[data-site-health-list]');
    if(!rows.length){host.innerHTML='<p class="site-health-empty">조건에 맞는 사이트가 없습니다.</p>';return}
    host.innerHTML=rows.map(row=>`<article class="site-health-row ${esc(row.tone)}">
      <div class="site-health-site"><i></i><div><strong>${esc(row.name||row.label)}</strong><a href="${esc(row.url)}" target="_blank" rel="noopener">${esc(row.label||keyOf(row.url))} ↗</a></div></div>
      <span class="site-health-state">${esc(row.state)}</span>
      <div class="site-health-detail"><b>${esc(row.response||'—')}</b><span>${esc(row.detail||'')}</span></div>
      <time>${row.checked?esc(new Date(row.checked).toLocaleString('ko-KR')):(active==='static'?'배포·구성':'—')}</time>
    </article>`).join('');
  }
  function init(){
    const root=ensurePanel();if(!root)return;
    const button=document.querySelector('[data-section="site-health"]');
    button?.addEventListener('click',()=>{window.EKODIAdminPanels?.activate?.(SECTION);if(!catalog.length)load(false);});
    if(location.pathname==='/admin/status/site-health'||location.hash==='#site-health')load(false);
    window.addEventListener('ekodi-nav-changed',()=>{const b=document.querySelector('[data-section="site-health"]');if(b&&!b.dataset.siteHealthBound){b.dataset.siteHealthBound='true';b.addEventListener('click',()=>{if(!catalog.length)load(false)})}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();