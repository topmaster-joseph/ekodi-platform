// Highest-admin only Growth OS control surface. Not a marketing console.
// Platform authority is never used to read or mutate a tenant's private data.
(() => {
  'use strict';
  const ROOT_ID='ekodiGrowthOsAdmin';
  if (document.getElementById(ROOT_ID)) return;
  const parent=document.querySelector('.content');
  if(!parent)return;
  const token=()=>{try{return sessionStorage.getItem('ekodi-auth-token')||'';}catch{return'';}};
  const esc=(value)=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[ch]));
  const PROFILES=Object.freeze({
    ministry:{label:'교회·선교·돌봄',purpose:'돌봄·예배·선교·공동체의 건강한 지속',focus:['목적·가치','사람·관계','신뢰·안전']},
    cooperative:{label:'협동조합·단체·상인회',purpose:'회원참여·지역 가치·지속 가능한 공동이익',focus:['사람·관계','재정·자원','신뢰·안전']},
    commerce:{label:'매장·사업·상거래',purpose:'고객 가치·사업 건전성·지속 가능한 수익',focus:['운영·서비스','재정·자원','사람·관계']},
    education:{label:'교육·연구·출판',purpose:'배움과 지식의 신뢰·접근성',focus:['목적·가치','학습·변화','신뢰·안전']},
    institution:{label:'기관·공익서비스',purpose:'공공성·책무·서비스 접근성',focus:['목적·가치','사람·관계','신뢰·안전']},
    platform:{label:'플랫폼·공통서비스',purpose:'안전한 연결·운영·지속적 개선',focus:['운영·서비스','신뢰·안전','학습·변화']},
    general:{label:'목적 프로필 미설정',purpose:'책임 관리자와 조직 목적·성장 기준을 먼저 확정',focus:[]},
  });
  const DIMENSIONS=['목적·가치','사람·관계','운영·서비스','재정·자원','접근·확산','신뢰·안전','학습·변화'];
  // Suggested scopes are navigation hints, not permissions or final organizational classification.
  const TYPE_HINTS=Object.freeze({
    church:'ministry',mission:'ministry',cgma:'cooperative','cheonggye-local':'cooperative',
    mall:'commerce',jadam:'commerce',pizzamaru:'commerce',yogurt:'commerce',biz:'commerce',
    education:'education',books:'education',publishing:'education',journal:'education',lab:'education',
    'seonammedi':'institution',community:'institution',management:'platform',
  });
  let items=[],registry=null,automation=null,authorized=false,loading=false,loadError='',search='',currentId='';
  const panel=document.createElement('section');
  panel.id=ROOT_ID;panel.className='section ekodi-growth-control hidden-panel';
  panel.dataset.panel='growth-os';panel.hidden=true;
  panel.setAttribute('aria-labelledby','ekodiGrowthOsTitle');
  parent.prepend(panel);
  function active(){return !panel.hidden&&!panel.classList.contains('hidden-panel');}
  function profileOf(item){return PROFILES[TYPE_HINTS[item?.id]||'general'] ? TYPE_HINTS[item?.id]||'general' : 'general';}
  function publicPaths(){
    if(!Array.isArray(registry?.resources))return null;
    return new Set(registry.resources
      .filter(item=>item?.type==='site'||item?.source==='discovery-layer')
      .map(item=>{try{const u=new URL(item.url);return u.protocol==='https:'&&u.hostname==='ekodi.kr'?u.pathname.replace(/\/$/,'')||'/':null;}catch{return null;}})
      .filter(Boolean));
  }
  function safeBase(item){
    const raw=String(item?.basePath||'');
    if(!/^\/[a-z0-9/-]{1,90}$/i.test(raw)||raw.includes('//'))return'';
    return raw.replace(/\/$/,'');
  }
  function options(rows){
    const count=rows.length;
    return '<option value="">'+esc('등록된 대상 중 선택 ('+count+'건)')+'</option>'+
      rows.map(item=>'<option value="'+esc(item.id)+'"'+(currentId===item.id?' selected':'')+'>'+esc(item.name)+' · '+esc(item.kind==='site'?'사이트':'서비스')+'</option>').join('');
  }
  function statusCard(label,value,description){
    return '<article class="growth-os-stat"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><span>'+esc(description)+'</span></article>';
  }
  function render(){
    if(!authorized){panel.innerHTML='<div class="growth-os-empty" role="alert">최고관리자 인증이 필요합니다.</div>';return;}
    const catalog=items.filter(item=>item?.id&&item?.name);
    const filtered=catalog.filter(item=>!search||(item.name+' '+item.id+' '+item.group).toLowerCase().includes(search.toLowerCase()));
    const selected=catalog.find(item=>item.id===currentId)||null;
    const registered=publicPaths();
    const base=safeBase(selected);
    const knownPublic=registered&&base?registered.has(base):null;
    const profile=profileOf(selected);
    const chosen=PROFILES[profile]||PROFILES.general;
    // Read-only, centrally aggregated figures come only from the protected
    // super-admin API. Public URL registration is never mislabelled as indexing.
    const rawAutomation=Array.isArray(automation?.sites)?automation.sites:[];
    const siteRows=catalog.filter(item=>item.kind==='site').map(item=>{
      const recorded=rawAutomation.find(x=>x.id===item.id);
      return {...item,...(recorded||{}),summaryAvailable:Boolean(recorded)};
    }).filter(item=>!search||(item.name+' '+item.id+' '+item.group).toLowerCase().includes(search.toLowerCase()));
    const metric=(value,suffix='')=>value===null||value===undefined?'미연동':String(value)+suffix;
    const registeredPaths=publicPaths();
    const summarySources=automation?.sources||{};
    const automationTable=`<section class="growth-os-card growth-os-automation-overview" aria-label="사이트별 검색·추천·홍보 자동화 총괄현황">
      <header><h3>사이트별 노출·추천·홍보 자동화 총괄</h3><small>중앙은 요약·이상징후, 상세는 해당 사이트 관리자</small></header>
      <p class="growth-os-note">연결 채널과 게시 작업은 해당 사이트에 명시적으로 연결된 원장만 집계합니다. 공개 URL 등록은 실제 검색 색인·노출이 아닙니다. 미연동은 0건이 아닙니다.</p>
      <div class="growth-os-automation-scroll"><table class="growth-os-automation-table"><thead><tr>
      <th scope="col">사이트</th><th scope="col">공개 검색 원장</th><th scope="col">연결 채널</th><th scope="col">게시 성공 · 누적</th><th scope="col">대기 / 실패</th><th scope="col">상세 운영</th>
      </tr></thead><tbody>${siteRows.map(item=>{
        const base=safeBase(item),known=registeredPaths&&base?registeredPaths.has(base):null;
        const adminPath=typeof item.adminPath==='string'&&item.adminPath.startsWith('/')&&/^[a-z0-9][a-z0-9/_-]*$/i.test(item.adminPath.slice(1))?item.adminPath:'';
        const pending=metric(item.pendingJobs),failed=metric(item.failedJobs);
        return `<tr><th scope="row">${esc(item.name)}<small>${esc(base||'경로 미확인')}</small></th>
          <td>${known===true?'공개 경로 있음':known===false?'공개 경로 미확인':'원장 미연동'}</td>
          <td>${metric(item.activeChannels,'개')}</td><td>${metric(item.publishedTotal,'건')}</td>
          <td>${pending} / ${failed}</td><td>${adminPath?`<a href="${esc(adminPath)}">사이트 관리자</a>`:'사이트 관리경로 미연동'}</td></tr>`;
      }).join('')||'<tr><td colspan="6">조건에 맞는 사이트가 없습니다.</td></tr>'}</tbody></table></div>
      <p class="growth-os-note">원장 상태 · 채널 ${esc(summarySources.connections||'미확인')} · 게시 ${esc(summarySources.jobs||'미확인')} · 정책 ${esc(summarySources.policies||'미확인')} · 세부 기능은 사이트별 접근권한으로 확인합니다.</p></section>`;
    const stats=[
      statusCard('중앙 등록 서비스',catalog.length,'기준: 기존 관리자 서비스 카탈로그'),
      statusCard('카탈로그상 사이트',catalog.filter(item=>item.kind==='site').length,'비공개 조직 원장 전체와 다를 수 있음'),
      statusCard('공개 검색 원장',registered ? registered.size : '미연동','공개 경로만 포함 · 비공개 조직 제외'),
      statusCard('실측 조직 종합평가','미연동','인증된 목적·운영·재무·참여 증거 필요'),
    ].join('');
    panel.innerHTML=`<header class="growth-os-head"><div><small>EKODI GROWTH INTELLIGENCE CORE · PRIVATE</small>
      <h2 id="ekodiGrowthOsTitle">통합 성장·지속가능성</h2>
      <p>각 조직의 목적을 중심으로 사람·운영·재정·접근성·신뢰·학습을 판단하는 공통 관제입니다. 성장 OS는 판단·제안을 담당하고 실행은 에코디 오케스트레이터의 권한·정책을 따릅니다.</p></div>
      <button class="secondary" type="button" data-growth-reload ${loading?'disabled':''}>${loading?'확인 중':'등록 현황 갱신'}</button></header>
      ${loadError?'<p class="growth-os-warning" role="status">'+esc(loadError)+'</p>':''}
      <div class="growth-os-stats">${stats}</div>
      ${automationTable}
      <div class="growth-os-work">
        <section class="growth-os-card">
          <header><h3>대상 선택</h3><small>공통 서비스 카탈로그를 기반으로 검색</small></header>
          <label>검색<input type="search" data-growth-search placeholder="조직·기관·서비스 검색" value="${esc(search)}" maxlength="80"></label>
          <label>조직·사이트·서비스<select data-growth-target>${options(filtered)}</select></label>
          <p class="growth-os-note">현재 목록은 관리자 서비스 카탈로그입니다. 법인·기관·비공개 사업체 전체 원장과 동일하지 않습니다. 공개 원장의 포함 여부는 승인된 공개 정보만 표시합니다.</p>
          <div class="growth-os-links"><a href="/admin/sites/sites-all">사이트 현황</a><a href="/admin/ops/maturity">플랫폼 성숙도</a><a href="/admin/ops/site-health">사이트 상태</a><a href="/admin/ai/search-visibility">검색노출·AI 발견 관리</a></div>
        </section>
        <section class="growth-os-card" aria-live="polite"><header><h3>${selected?esc(selected.name):'조직별 판단 기준'}</h3><small>${selected?'목적별 프로필 · 참고 분류':'등록 대상을 선택하십시오'}</small></header>
          ${selected?`<div class="growth-os-profile"><strong>${esc(chosen.label)}</strong><p>${esc(chosen.purpose)}</p>
          <small>유형은 카탈로그 기반 안내입니다. 조직의 실제 목적·평가 기준은 책임자의 확인 전까지 확정되지 않습니다.</small></div>
          <p>공개 사이트 원장: <strong>${knownPublic===true?'공개 경로 등록 확인':knownPublic===false?'공개 경로 미확인':'연동 미확인'}</strong></p>
          <h4>목적별 주요 관점</h4><div class="growth-os-focus">${(chosen.focus.length?chosen.focus:['목적 확정 필요']).map(x=>'<span>'+esc(x)+'</span>').join('')}</div>
          <h4>7개 통합 판단 차원</h4><div class="growth-os-dimensions">${DIMENSIONS.map(x=>'<div><span>'+esc(x)+'</span><em>근거 미연동</em></div>').join('')}</div>
          <p class="growth-os-note">근거 미연동 ≠ 성과 0점. 재무·회원·개인정보는 이 화면에서 다른 조직의 데이터와 결합하지 않습니다.</p>`:
          '<p class="growth-os-empty">등록 대상과 조직 목적을 확인하면 개별 성장 진단 계약을 단계적으로 연결합니다.</p>'}
        </section>
      </div>
      <section class="growth-os-card"><header><h3>공통 엔진 운영 체계</h3><small>진단과 실행의 권한 분리</small></header>
      <div class="growth-os-lifecycle"><span>목적·권한 확인</span><b>→</b><span>승인된 증거 수집</span><b>→</b><span>분야별 판단</span><b>→</b><span>개선안 검토</span><b>→</b><span>오케스트레이터 실행·실증</span></div>
      <p class="growth-os-note">실제 사업 성과·건강한 공동체·재정 지속가능성은 각각 별도의 검증된 원장이 연결되어야 판단할 수 있습니다. 단일 성장 점수나 조직 간 서열을 생성하지 않습니다.</p>
      <div class="growth-os-links"><a href="/admin/ai/aiops">EKODI 오케스트레이터</a><a href="/admin/services/engine-common">공통 엔진</a><a href="/admin/services/marketing-ai">마케팅 전문 실행</a></div></section>`;
  }
  async function api(path,accessToken){
    const r=await fetch(path,{method:'GET',headers:accessToken?{'authorization':'Bearer '+accessToken}:{},cache:'no-store',credentials:'omit'});
    if(!r.ok)throw new Error('연결 상태 '+r.status);
    return r.json();
  }
  async function refresh(force=false){
    if(!authorized||loading)return;
    if(items.length&&registry&&!force){render();return;}
    loading=true;render();
    try{
      const [catalog,publicRegistry,visibility]=await Promise.all([
        import('/admin/admin-service-catalog.js'),
        api('/public-registry.json').catch(()=>null),
        api('/api/control/search-visibility',token()).catch(()=>null),
      ]);
      items=Array.isArray(catalog.ADMIN_SERVICE_CATALOG)?catalog.ADMIN_SERVICE_CATALOG:[];
      registry=publicRegistry;
      automation=visibility?.automation||null;
      if(!currentId&&items.length)currentId=items.find(item=>item.kind==='site')?.id||items[0].id;
      loadError=[!publicRegistry?'공개 검색 원장을 조회하지 못했습니다. 검색 등록 상태는 미확인으로 표시합니다.':'',!visibility?'자동화 집계 원장 연결 실패 · 개별 사이트에서 확인하십시오.':''].filter(Boolean).join(' ');
    }catch(e){loadError='관리자 서비스 기준정보 연결 실패 · '+String(e?.message||'').slice(0,100);}
    finally{loading=false;render();}
  }
  async function authorize(){
    const accessToken=token();
    if(!accessToken){authorized=false;render();return;}
    try{
      const session=await api('/api/session',accessToken);
      authorized=session?.role==='super_admin';
      if(authorized)await refresh();
      else render();
    }catch{authorized=false;render();}
  }
  panel.addEventListener('change',e=>{const select=e.target.closest('[data-growth-target]');if(!select)return;
    const chosen=items.find(item=>item.id===select.value);
    currentId=chosen?.id||'';render();});
  panel.addEventListener('input',e=>{const input=e.target.closest('[data-growth-search]');if(!input)return;
    search=input.value.slice(0,80);
    // Update select without replacing the focused input while typing.
    const target=panel.querySelector('[data-growth-target]');
    if(target)target.innerHTML=options(items.filter(item=>(item.name+' '+item.id+' '+item.group).toLowerCase().includes(search.toLowerCase())));
  });
  panel.addEventListener('click',e=>{if(e.target.closest('[data-growth-reload]'))void refresh(true);});
  window.addEventListener('ekodi-admin-section-changed',e=>{if(e?.detail?.section==='growth-os'&&authorized)void refresh();});
  void authorize();
})();
