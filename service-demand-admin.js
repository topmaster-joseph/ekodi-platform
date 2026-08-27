(() => {
  'use strict';
  const MODULE_ID='ekodiServiceDemandRadar';
  const SECTION='service-demands';
  const API='https://api.ekodi.kr/api/control/service-demands';
  const TOKEN_KEY='ekodi-auth-token';
  if(document.getElementById(MODULE_ID))return;
  const nav=document.querySelector('.sidebar nav');
  const content=document.querySelector('.content');
  if(!nav||!content)return;
  const token=()=>{try{return sessionStorage.getItem(TOKEN_KEY)||''}catch{return''}};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STATUS=[['new','신규'],['reviewing','검토'],['planned','구축예정'],['integrating','연결중'],['launched','제공중'],['declined','보류'],['archived','종료']];
  const IMPLEMENT=[['','미정'],['existing','기존 서비스 확장'],['new','신규 구축'],['external','외부 모듈 연결']];

  const button=document.createElement('button');
  button.type='button';button.className='nav';button.dataset.section=SECTION;button.title='사용자가 원하는 미제공 서비스 수요를 검토합니다.';
  button.append(document.createTextNode('◎ '));const label=document.createElement('span');label.textContent='수요 레이더';button.append(label);
  const services=nav.querySelector('[data-section="services"]');if(services)services.insertAdjacentElement('afterend',button);else nav.append(button);

  const section=document.createElement('section');
  section.id=MODULE_ID;section.className='section service-demand-section hidden-panel';section.dataset.panel=SECTION;section.hidden=true;
  section.innerHTML=`<div class="section-head service-demand-head"><div><p class="kicker">NEED → LEARN → EXPAND</p><h2>서비스 수요 레이더</h2><p class="operations-copy">현재 제공하지 못하는 필요를 익명 집계해 검토하고, 기존 확장·신규 구축·외부 모듈 연결로 전환합니다.</p></div><button class="secondary compact" type="button" data-demand-refresh>↻ 새로고침</button></div>
    <div class="service-demand-summary"><article><small>누적 요청</small><strong data-demand-requests>—</strong></article><article><small>수요 주제</small><strong data-demand-topics>—</strong></article><article><small>검토 대기</small><strong data-demand-new>—</strong></article><article><small>제공 전환</small><strong data-demand-launched>—</strong></article></div>
    <div class="service-demand-toolbar"><label>상태 <select data-demand-filter><option value="">전체</option>${STATUS.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><span data-demand-generated></span></div>
    <div data-demand-list class="service-demand-list"><p class="operations-loading">수요 레이더를 열면 최신 집계를 불러옵니다.</p></div>`;
  content.append(section);
  const list=section.querySelector('[data-demand-list]');
  const refresh=section.querySelector('[data-demand-refresh]');
  const filter=section.querySelector('[data-demand-filter]');
  let loading=false;

  async function api(path='',options={}){
    const value=token();if(!value)throw new Error('관리자 세션이 없습니다.');
    const headers={authorization:`Bearer ${value}`,...(options.headers||{})};
    if(options.body)headers['content-type']='application/json';
    const response=await fetch(`${API}${path}`,{...options,headers,cache:'no-store'});
    let data=null;try{data=await response.json()}catch{}
    if(!response.ok)throw new Error(data?.error||`HTTP ${response.status}`);
    return data;
  }
  const statusLabel=value=>STATUS.find(([v])=>v===value)?.[1]||value||'—';
  const date=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('ko-KR')};
  function scoreInput(name,label,value){return `<label>${label}<input type="number" min="0" max="100" step="1" name="${name}" value="${Number(value)||0}"></label>`}
  function render(data){
    const summary=data?.summary||{};
    section.querySelector('[data-demand-requests]').textContent=Number(summary.requests||0).toLocaleString('ko-KR');
    section.querySelector('[data-demand-topics]').textContent=Number(summary.topics||0).toLocaleString('ko-KR');
    section.querySelector('[data-demand-new]').textContent=Number(summary.byStatus?.new?.topics||0).toLocaleString('ko-KR');
    section.querySelector('[data-demand-launched]').textContent=Number(summary.byStatus?.launched?.topics||0).toLocaleString('ko-KR');
    section.querySelector('[data-demand-generated]').textContent=`갱신 ${date(data?.generatedAt)}`;
    const rows=data?.demands||[];list.textContent='';
    if(!rows.length){list.innerHTML='<p class="operations-loading">현재 조건에 해당하는 미제공 서비스 수요가 없습니다.</p>';return;}
    rows.sort((a,b)=>Number(b.priorityScore||0)-Number(a.priorityScore||0));
    rows.forEach(row=>{
      const card=document.createElement('article');card.className='service-demand-card';card.dataset.status=row.status;
      card.innerHTML=`<div class="service-demand-card-head"><div><span class="service-demand-priority">우선도 ${Number(row.priorityScore||0)}</span><strong>${esc(row.requestedCapability)}</strong><small>${esc(row.intent)} · ${esc(row.userSegment)} · 최근 ${esc(date(row.lastRequestedAt))}</small></div><b>${Number(row.requestCount||0).toLocaleString('ko-KR')}회</b></div>
        <form data-demand-form="${Number(row.id)}"><div class="service-demand-fields"><label>상태<select name="status">${STATUS.map(([v,l])=>`<option value="${v}"${v===row.status?' selected':''}>${l}</option>`).join('')}</select></label><label>공급 방식<select name="implementationType">${IMPLEMENT.map(([v,l])=>`<option value="${v}"${v===(row.implementationType||'')?' selected':''}>${l}</option>`).join('')}</select></label>${scoreInput('urgencyScore','긴급도',row.urgencyScore)}${scoreInput('businessValueScore','예상가치',row.businessValueScore)}${scoreInput('missionFitScore','에코디 적합도',row.missionFitScore)}</div><label class="service-demand-note">관리 메모<textarea name="adminNote" maxlength="500" rows="2" placeholder="검토 근거, 구축 방향, 외부 연계 후보 등">${esc(row.adminNote||'')}</textarea></label><div class="service-demand-actions"><span>${esc(statusLabel(row.status))}${row.reviewedAt?` · 검토 ${esc(date(row.reviewedAt))}`:''}</span><button class="primary compact" type="submit">검토 저장</button></div></form>`;
      list.append(card);
    });
    list.querySelectorAll('[data-demand-form]').forEach(form=>form.addEventListener('submit',save));
  }
  async function load(force=false){
    if(loading)return;loading=true;refresh.disabled=true;list.setAttribute('aria-busy','true');
    try{const q=filter.value?`?status=${encodeURIComponent(filter.value)}`:'';render(await api(q));}
    catch(error){list.innerHTML=`<p class="operations-error">수요 레이더를 불러오지 못했습니다: ${esc(error.message)}</p>`;}
    finally{loading=false;refresh.disabled=false;list.removeAttribute('aria-busy');}
  }
  async function save(event){
    event.preventDefault();const form=event.currentTarget;const submit=form.querySelector('button[type="submit"]');submit.disabled=true;
    const fd=new FormData(form);const body={status:fd.get('status'),implementationType:fd.get('implementationType'),urgencyScore:Number(fd.get('urgencyScore')),businessValueScore:Number(fd.get('businessValueScore')),missionFitScore:Number(fd.get('missionFitScore')),adminNote:String(fd.get('adminNote')||'')};
    try{await api(`/${encodeURIComponent(form.dataset.demandForm)}`,{method:'PUT',body:JSON.stringify(body)});await load(true);}
    catch(error){alert(`저장하지 못했습니다: ${error.message}`);}finally{submit.disabled=false;}
  }
  function activate(){
    section.hidden=false;document.querySelectorAll('[data-panel]').forEach(panel=>{const targets=String(panel.dataset.panel||'').split(/\s+/).filter(Boolean);const active=targets.includes(SECTION);panel.classList.toggle('hidden-panel',!active);if(!active&&!panel.hidden)panel.hidden=true;});
    document.querySelectorAll('.sidebar .nav').forEach(item=>item.classList.toggle('active',item===button));
    const title=document.querySelector('#pageTitle');if(title)title.textContent='서비스 수요 레이더';document.querySelector('.sidebar')?.classList.remove('open');if(location.hash!=='#service-demands')history.replaceState(null,'','#service-demands');load();
  }
  refresh.addEventListener('click',()=>load(true));filter.addEventListener('change',()=>load(true));button.addEventListener('click',activate);
  window.dispatchEvent(new CustomEvent('ekodi-feature-installed',{detail:{feature:SECTION}}));
  if(location.hash==='#service-demands'||location.hash==='#demand-radar')queueMicrotask(activate);
})();
