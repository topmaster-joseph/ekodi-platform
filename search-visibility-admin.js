// SEARCH-VISIBILITY-001: platform-super-admin search exposure workflow.
// Public-site inventory comes from the EKODI public registry; provider results
// remain unknown until verified by the actual provider. Local checklist notes
// are explicitly NOT Search Console / Webmaster confirmations.
(() => {
  'use strict';
  const ID='ekodiSearchVisibilityAdmin';
  if(document.getElementById(ID))return;
  const parent=document.querySelector('#app .content')||document.querySelector('.content');
  if(!parent)return;
  const panel=document.createElement('section');
  panel.id=ID;panel.dataset.panel='search-visibility';
  panel.className='section ekodi-search-visibility hidden-panel';panel.hidden=true;
  parent.prepend(panel);
  const STORE='ekodi-search-visibility-checklist-v1';
  const OFFICIAL=Object.freeze({
    google:{name:'구글',href:'https://search.google.com/search-console',hint:'도메인 속성 · DNS TXT 소유확인 · 사이트맵 · URL 검사'},
    naver:{name:'네이버',href:'https://searchadvisor.naver.com/',hint:'사이트 추가 · 소유확인 · 사이트맵 · 수집 요청'},
    daum:{name:'다음',href:'https://webmaster.daum.net/',hint:'소유확인 · 검색 수집 · 다음 검색등록 별도 확인'},
    bing:{name:'빙',href:'https://www.bing.com/webmasters/',hint:'Search Console 가져오기 또는 사이트 인증 · 사이트맵'},
  });
  const PHASES=Object.freeze([
    {id:'inventory',title:'1. 공개 대상과 대표 주소 확정',hint:'공개 사이트인지, 실제 검색 대표 주소와 별칭이 올바른지 점검'},
    {id:'technical',title:'2. 검색 수집 기술 점검',hint:'HTTP 응답 · robots/noindex · canonical · 메타설명 · 사이트맵 검토'},
    {id:'ownership',title:'3. 검색엔진 소유권 확인',hint:'각 검색엔진의 공식 관리도구에서 실제 확인한 증거만 기록'},
    {id:'sitemap',title:'4. 사이트맵 제출 및 수집 요청',hint:'제출 후 정상 접수 여부를 엔진별로 확인'},
    {id:'index',title:'5. 색인·검색결과 확인',hint:'접수 ≠ 색인. 실제 URL 검사 결과를 별도로 검증'},
    {id:'traffic',title:'6. 검색 성과 검증',hint:'연결된 제공자의 노출수·클릭수만 인정, 미연동은 미확인'},
  ]);
  const safeText=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const getToken=()=>{try{return sessionStorage.getItem('ekodi-auth-token')||'';}catch{return'';}};
  const state={authorized:false,busy:false,error:'',sites:[],selected:'seonammedi',registryDate:'',checks:{},diagnostic:null};
  try{const data=JSON.parse(localStorage.getItem(STORE)||'{}');if(data&&data.version===1&&typeof data.checks==='object'&&data.checks)state.checks=data.checks;}catch{}
  const PINNED=Object.freeze({id:'seonammedi',name:'서남권 국립의대 소통센터',url:'https://seonammedi.kr/',probe:'/seonammedi/',alias:'https://서남권국립의대.kr/',sitemap:'https://seonammedi.kr/sitemap.xml'});
  const active=()=>!panel.hidden&&!panel.classList.contains('hidden-panel');
  function permittedPath(path){return /^\/[a-z0-9][a-z0-9/_-]{0,100}\/??$/i.test(path)&&!/^\/(?:admin|auth|api|my|private|preview)(?:\/|$)/i.test(path);}
  function fromRegistry(registry){
    const resources=Array.isArray(registry?.resources)?registry.resources:[];
    const sites=[PINNED];
    const seen=new Set([PINNED.probe.replace(/\/$/,'')]);
    for(const r of resources){
      if(r?.type!=='site'||!r.url||!r.name)continue;
      let url;try{url=new URL(r.url);}catch{continue;}
      if(url.protocol!=='https:'||url.hostname!=='ekodi.kr'||!permittedPath(url.pathname))continue;
      const path=url.pathname.replace(/\/$/,'');
      if(seen.has(path))continue;
      seen.add(path);
      sites.push({id:'site:'+path,name:String(r.name).slice(0,100),url:url.href,probe:path+'/',alias:'',sitemap:'https://ekodi.kr/sitemap.xml'});
    }
    return sites;
  }
  function checklistKey(site,phase,provider=''){return site.id+'|'+phase+'|'+provider;}
  function saved(site,phase,provider=''){return state.checks[checklistKey(site,phase,provider)]||null;}
  function saveRecord(site,phase,provider,record){
    state.checks[checklistKey(site,phase,provider)]=record;
    try{localStorage.setItem(STORE,JSON.stringify({version:1,checks:state.checks}));return true;}
    catch{state.error='브라우저 기록 저장 실패: 내보내기로 백업하십시오.';return false;}
  }
  function selectedSite(){return state.sites.find(s=>s.id===state.selected)||PINNED;}
  function status(record){return record?.done?'수동 확인 기록':'미확인';}
  function stageRow(site,phase){
    const rec=saved(site,phase.id);
    const checked=!!rec?.done;
    return '<li class="sv-phase"><div class="sv-phase-main"><strong>'+safeText(phase.title)+'</strong><p>'+safeText(phase.hint)+'</p>'+
      '<small>상태: '+status(rec)+(checked&&rec?.at?' · '+safeText(rec.at.slice(0,10)):'')+'</small></div>'+
      '<label><input type="checkbox" data-sv-phase="'+phase.id+'" '+(checked?'checked':'')+'> 담당자 확인 기록</label></li>';
  }
  function links(site){
    const rows=Object.entries(OFFICIAL).map(([key,provider])=>{
      const rec=saved(site,'provider',key);
      const done=!!rec?.done;
      return '<tr><th scope="row">'+safeText(provider.name)+'</th><td><span class="sv-status '+(done?'sv-done':'')+'">'+status(rec)+'</span></td>'+
        '<td><a href="'+provider.href+'" target="_blank" rel="noopener noreferrer">공식 관리도구</a><small>'+safeText(provider.hint)+'</small></td>'+
        '<td><label class="sv-checkbox"><input type="checkbox" data-sv-provider="'+key+'" '+(done?'checked':'')+'> 확인 기록</label></td></tr>';
    }).join('');
    return '<div class="sv-scroll"><table><thead><tr><th>검색엔진</th><th>확인 기록</th><th>실제 등록·검증</th><th>기록</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  }
  function diagnostic(){
    if(!state.diagnostic)return '<p>아직 검사하지 않았습니다. ‘공개 페이지 진단’을 누르면 서버 응답과 기본 검색 메타정보를 직접 검사합니다.</p>';
    const d=state.diagnostic;
    const fields=[
      ['중앙 경로 HTTP',d.http||'미확인'],['대표 주소(canonical)',d.canonical||'누락/미확인'],
      ['robots 메타',d.robots||'미설정'],['설명 메타',d.description?'존재':'누락'],
      ['문서 제목',d.title||'누락'],['H1',d.h1||'누락'],
    ];
    return '<p class="sv-note">검사 경로: '+safeText(d.checkedUrl||'')+' · '+safeText(d.at||'')+'</p>'+
      '<p class="sv-note">중앙 경로의 HTML 점검입니다. 독립 도메인의 DNS·실제 검색엔진 인증 상태를 증명하지 않습니다.</p>'+
      '<dl class="sv-diagnostics">'+fields.map(([k,v])=>'<div><dt>'+safeText(k)+'</dt><dd>'+safeText(v)+'</dd></div>').join('')+'</dl>';
  }
  function render(){
    if(!state.authorized){panel.innerHTML='<div class="sv-guard" role="alert">최고관리자 인증이 필요합니다. 로그인한 계정의 super_admin 권한을 확인하십시오.</div>';return;}
    const site=selectedSite();
    const options=state.sites.map(s=>'<option value="'+safeText(s.id)+'" '+(s.id===site.id?'selected':'')+'>'+safeText(s.name)+'</option>').join('');
    panel.innerHTML='<header class="sv-heading"><div><p class="sv-eyebrow">EKODI · SEARCH VISIBILITY</p><h2>검색노출관리</h2>'+
      '<p>공개 대상 → 기술 점검 → 소유권 확인 → 사이트맵 제출 → 색인 → 실측 성과. 확인되지 않은 엔진 결과는 성공으로 간주하지 않습니다.</p></div>'+
      '<button type="button" data-sv-refresh '+(state.busy?'disabled':'')+'>공개 사이트 갱신</button></header>'+
      (state.error?'<p class="sv-error" role="alert">'+safeText(state.error)+'</p>':'')+
      '<div class="sv-grid"><label class="sv-card">관리 대상 사이트<select data-sv-site>'+options+'</select><small>에코디 공개 원장 기준 · '+safeText(state.registryDate||'아직 동기화되지 않음')+'</small></label>'+
      '<div class="sv-card"><span>검색 대표 주소</span><strong>'+safeText(site.url)+'</strong><a href="'+safeText(site.url)+'" target="_blank" rel="noopener noreferrer">홈페이지 확인</a></div>'+
      '<div class="sv-card"><span>사이트맵</span><strong>'+safeText(site.sitemap)+'</strong><a href="'+safeText(site.sitemap)+'" target="_blank" rel="noopener noreferrer">사이트맵 열기</a></div></div>'+
      (site.alias?'<p class="sv-alias">시민 홍보용 한글 주소: <a href="'+safeText(site.alias)+'" target="_blank" rel="noopener noreferrer">'+safeText(site.alias)+'</a> · 대표 주소 이동(301)은 별도 운영 확인 필요</p>':'')+
      '<section class="sv-card"><div class="sv-subhead"><h3>① 공개 페이지 기술 진단</h3><button type="button" data-sv-diagnose '+(state.busy?'disabled':'')+'>공개 페이지 진단</button></div>'+diagnostic()+'</section>'+
      '<section class="sv-card"><h3>② 실행 순서별 점검 기록</h3><p class="sv-note">체크는 담당자의 이 브라우저 기록일 뿐, 실제 구글·네이버 색인 성공을 의미하지 않습니다. 기록을 남기기 전 공식 관리도구에서 확인하십시오.</p><ol class="sv-phases">'+PHASES.map(p=>stageRow(site,p)).join('')+'</ol></section>'+
      '<section class="sv-card"><h3>③ 검색엔진별 등록·소유확인</h3>'+links(site)+'</section>'+
      '<section class="sv-card"><h3>④ 검증과 이력 관리</h3><p class="sv-note">검색 실적은 API 연결이 검증되기 전에는 <strong>미연동</strong>입니다. 수집요청·제출·색인·클릭은 각각 서로 다른 상태입니다.</p>'+
      '<div class="sv-actions"><a href="https://github.com/topmaster-joseph/ekodi-platform/issues/6317" target="_blank" rel="noopener noreferrer">EKODI 중앙 작업·감사 이슈 #6317</a>'+
      '<a href="/admin/ai/growth-os">Growth OS</a><a href="/admin/ops/site-health">사이트 상태</a>'+
      '<button type="button" data-sv-export>이 브라우저 확인 기록 내보내기</button></div></section>';
  }
  async function get(url,options={}){
    const res=await fetch(url,{credentials:'omit',cache:'no-store',...options});
    if(!res.ok)throw new Error('HTTP '+res.status);
    return res;
  }
  async function authorize(){
    const token=getToken(); if(!token){render();return;}
    try{
      const result=await (await get('/api/session',{headers:{authorization:'Bearer '+token}})).json();
      state.authorized=result?.role==='super_admin';
      if(state.authorized)await refresh();
      else render();
    }catch{state.authorized=false;render();}
  }
  async function refresh(){
    if(!state.authorized||state.busy)return;
    state.busy=true;state.error='';render();
    try{
      const registry=await (await get('/public-registry.json')).json();
      if(!Array.isArray(registry?.resources))throw new Error('공개 원장 형식 불일치');
      state.sites=fromRegistry(registry);
      state.registryDate=registry.generatedAt||'갱신 일시 미확인';
      if(!state.sites.some(s=>s.id===state.selected))state.selected='seonammedi';
    }catch(error){
      state.error='공개 사이트 원장 조회 실패: '+String(error.message||error);
      if(!state.sites.length)state.sites=[PINNED];
    }finally{state.busy=false;render();}
  }
  async function diagnose(){
    if(!state.authorized||state.busy)return;
    const site=selectedSite();state.busy=true;state.error='';render();
    try{
      // Single origin + allowlisted registry path: no arbitrary URL fetch/SSRF.
      const response=await get(site.probe);
      const html=await response.text();
      const doc=new DOMParser().parseFromString(html,'text/html');
      const meta=name=>doc.querySelector('meta[name="'+name+'"]')?.getAttribute('content')||'';
      state.diagnostic={
        at:new Date().toISOString(),checkedUrl:location.origin+site.probe,
        http:String(response.status),
        canonical:doc.querySelector('link[rel="canonical"]')?.getAttribute('href')||'',
        robots:meta('robots')||response.headers.get('x-robots-tag')||'',
        description:meta('description'),title:doc.title,h1:doc.querySelector('h1')?.textContent?.trim()||''
      };
    }catch(error){state.diagnostic=null;state.error='공개 페이지 진단 실패: '+String(error.message||error);}
    finally{state.busy=false;render();}
  }
  panel.addEventListener('change',event=>{
    if(!state.authorized)return;
    const target=event.target;
    if(target.matches('[data-sv-site]')){state.selected=target.value;state.diagnostic=null;render();return;}
    if(target.matches('[data-sv-phase],[data-sv-provider]')){
      const site=selectedSite(),phase=target.dataset.svPhase||'provider',provider=target.dataset.svProvider||'';
      saveRecord(site,phase,provider,{done:target.checked,at:new Date().toISOString()});
      render();
    }
  });
  panel.addEventListener('click',event=>{
    if(!state.authorized)return;
    if(event.target.closest('[data-sv-refresh]'))void refresh();
    if(event.target.closest('[data-sv-diagnose]'))void diagnose();
    if(event.target.closest('[data-sv-export]')){
      const blob=new Blob([JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),checks:state.checks},null,2)],{type:'application/json'});
      const a=document.createElement('a'),url=URL.createObjectURL(blob);
      a.href=url;a.download='ekodi-search-visibility-checklist.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
  });
  window.addEventListener('ekodi-admin-section-changed',event=>{
    if(event?.detail?.section==='search-visibility'&&state.authorized&&active()&&!state.sites.length)void refresh();
  });
  state.sites=[PINNED];
  void authorize();
})();
