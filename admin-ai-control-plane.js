(() => {
  'use strict';
  if (window.EKODIAdminAIControlPlane) return;

  const API='https://api.ekodi.kr';
  const TOKEN_KEY='ekodi-auth-token';
  const SPECIALISTS=[
    {id:'chief',label:'EKODI Admin AI',detail:'총괄 AI · 전체 조정'},
    {id:'infrastructure',label:'Infrastructure AI',detail:'Cloudflare · 도메인 · Worker'},
    {id:'development',label:'Development AI',detail:'GitHub · Repository · Branch · Actions'},
    {id:'devops',label:'DevOps AI',detail:'빌드 · 배포 · 검증 · 롤백'},
    {id:'security',label:'Security AI',detail:'인증 · 권한 · Secret'},
    {id:'data',label:'Data AI',detail:'DB · 백업 · 마이그레이션'},
    {id:'ai_gateway',label:'AI Gateway AI',detail:'AI 공급자 · Gateway · 복원력'},
  ];
  let providerData=null;
  let providerState={status:'idle',httpStatus:null,message:'아직 확인하지 않았습니다.',detail:'',updatedAt:null};
  let selectedSpecialist='chief';

  function token(){try{return sessionStorage.getItem(TOKEN_KEY)||''}catch{return''}}
  function headers(){const value=token();return value?{authorization:`Bearer ${value}`}:{}}
  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function setProviderState(next){providerState={...providerState,...next,updatedAt:new Date().toISOString()};renderDiagnostics();enhanceAiOps(true)}
  function classifyProviderError(status,payload){
    const serverMessage=payload?.message||payload?.error||payload?.detail||'';
    if(status===401)return {status:'error',httpStatus:status,message:'EKODI 관리자 인증이 필요합니다.',detail:'로그인 세션 또는 관리자 토큰을 확인하세요.'};
    if(status===403)return {status:'error',httpStatus:status,message:'Cloudflare 또는 관리자 권한이 부족합니다.',detail:serverMessage||'API Token의 Account/Zone/Workers 읽기 권한과 관리자 권한을 확인하세요.'};
    if(status===404)return {status:'error',httpStatus:status,message:'공급자 조회 API를 찾을 수 없습니다.',detail:'api.ekodi.kr 배포 경로와 라우팅을 확인하세요.'};
    if(status===429)return {status:'warn',httpStatus:status,message:'Cloudflare 조회가 일시적으로 제한되었습니다.',detail:'잠시 후 다시 확인하거나 API rate limit 상태를 점검하세요.'};
    if(status>=500)return {status:'error',httpStatus:status,message:'공급자 조회 서버에서 오류가 발생했습니다.',detail:serverMessage||'Control API와 Cloudflare 연동 로그를 확인하세요.'};
    return {status:'error',httpStatus:status,message:'공급자 정보를 확인하지 못했습니다.',detail:serverMessage||`HTTP ${status}`};
  }
  async function loadProviders(){
    if(!token()){
      providerData=null;
      setProviderState({status:'error',httpStatus:401,message:'관리자 인증 후 Worker를 확인할 수 있습니다.',detail:'로그인 상태를 확인하세요.'});
      return null;
    }
    setProviderState({status:'loading',httpStatus:null,message:'Cloudflare 계정 · Zone · Worker를 확인하고 있습니다.',detail:''});
    try{
      const response=await fetch(`${API}/api/control/secrets/providers`,{headers:headers(),cache:'no-store'});
      let payload=null;
      try{payload=await response.json()}catch{}
      if(!response.ok)throw Object.assign(new Error(`HTTP ${response.status}`),{status:response.status,payload});
      providerData=payload||{};
      const cf=providerData.cloudflare||{};
      const workers=cf.workers||[];
      const warnings=cf.warnings||[];
      const detail=workers.length
        ?`${workers.length}개 Worker 확인${warnings.length?` · 경고 ${warnings.length}건`:''}`
        :(warnings.length?warnings.join(' · '):'Worker 목록이 비어 있습니다. Cloudflare Account ID와 Workers 읽기 권한을 확인하세요.');
      setProviderState({status:workers.length?'ok':'warn',httpStatus:200,message:workers.length?'Cloudflare Worker 확인 완료':'Cloudflare 연결은 되었지만 Worker를 찾지 못했습니다.',detail});
      enhanceSecurity(true);
      enhanceAiOps(true);
      return providerData;
    }catch(error){
      providerData=null;
      const state=classifyProviderError(error.status||0,error.payload);
      setProviderState(state);
      console.warn('[EKODI Control Plane] provider inventory unavailable',error);
      return null;
    }
  }

  function installStyle(){
    if(document.querySelector('#ekodiControlPlaneStyle'))return;
    const style=document.createElement('style');style.id='ekodiControlPlaneStyle';style.textContent=`
      .ekodi-provider-context{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 12px;padding:12px;border:1px solid rgba(148,163,184,.22);border-radius:14px;background:rgba(15,23,42,.5)}
      .ekodi-provider-context label,.ekodi-specialist-switch label{display:block;font-size:11px;opacity:.72;margin-bottom:5px}.ekodi-provider-context select,.ekodi-specialist-switch select{width:100%;min-height:36px;border-radius:9px;border:1px solid rgba(148,163,184,.28);background:#111827;color:#e5e7eb;padding:0 9px}
      .ekodi-provider-note{grid-column:1/-1;font-size:11px;opacity:.72;line-height:1.5}.ekodi-control-plane-card{margin:12px 0;padding:14px;border:1px solid rgba(148,163,184,.2);border-radius:14px;background:rgba(15,23,42,.54)}
      .ekodi-control-plane-card h3{margin:0 0 10px;font-size:15px}.ekodi-provider-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ekodi-provider-tile{padding:10px;border-radius:11px;background:rgba(30,41,59,.72)}.ekodi-provider-tile strong{display:block;font-size:13px}.ekodi-provider-tile small{display:block;margin-top:5px;opacity:.72;line-height:1.45}.ekodi-provider-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#34d399;margin-right:6px}.ekodi-provider-dot.warn{background:#f59e0b}.ekodi-provider-dot.error{background:#ef4444}.ekodi-provider-dot.loading{background:#60a5fa}
      .ekodi-provider-diagnostic{grid-column:1/-1;padding:11px 12px;border-radius:11px;background:rgba(30,41,59,.78);display:flex;gap:10px;align-items:flex-start;justify-content:space-between}.ekodi-provider-diagnostic-main{min-width:0}.ekodi-provider-diagnostic strong{display:block;font-size:13px}.ekodi-provider-diagnostic small{display:block;margin-top:4px;opacity:.72;line-height:1.45}.ekodi-provider-retry{flex:0 0 auto;border:1px solid rgba(148,163,184,.3);background:#111827;color:#e5e7eb;border-radius:9px;padding:7px 10px;cursor:pointer}.ekodi-provider-retry:disabled{opacity:.5;cursor:default}
      .ekodi-specialist-switch{margin:10px 0;padding:10px;border:1px solid rgba(148,163,184,.18);border-radius:12px}.ekodi-specialist-switch small{display:block;margin-top:5px;opacity:.7}.ekodi-specialist-hint{margin-top:7px;font-size:11px;opacity:.68;line-height:1.45}
      @media(max-width:760px){.ekodi-provider-context,.ekodi-provider-grid{grid-template-columns:1fr}.ekodi-provider-note,.ekodi-provider-diagnostic{grid-column:auto}}
    `;document.head.appendChild(style);
  }

  function diagnosticMarkup(){
    const state=providerState.status;
    const dot=state==='ok'?'':state==='loading'?'loading':state==='warn'?'warn':'error';
    const http=providerState.httpStatus?` · HTTP ${providerState.httpStatus}`:'';
    return `<div class="ekodi-provider-diagnostic" data-ekodi-provider-diagnostic><div class="ekodi-provider-diagnostic-main"><strong><span class="ekodi-provider-dot ${dot}" aria-hidden="true"></span>${esc(providerState.message)}${http}</strong><small>${esc(providerState.detail||'계정 → Zone → Worker → 권한 순서로 진단합니다.')}</small></div><button type="button" class="ekodi-provider-retry" data-ekodi-provider-retry ${state==='loading'?'disabled':''}>다시 조회</button></div>`;
  }
  function bindRetry(root){root?.querySelector('[data-ekodi-provider-retry]')?.addEventListener('click',loadProviders)}
  function renderDiagnostics(){
    document.querySelectorAll('[data-ekodi-provider-diagnostic]').forEach(node=>{
      const wrapper=document.createElement('div');wrapper.innerHTML=diagnosticMarkup();const next=wrapper.firstElementChild;node.replaceWith(next);bindRetry(next.parentElement||document);
    });
  }

  function enhanceSecurity(force=false){
    const section=document.querySelector('#ekodiAdminSecretGenerator');
    if(!section)return;
    const card=section.querySelector('.admin-secret-auto-card');
    if(!card)return;
    if(force)card.querySelector('.ekodi-provider-context')?.remove();
    if(card.querySelector('.ekodi-provider-context'))return;
    const cf=providerData?.cloudflare||{};
    const context=document.createElement('div');context.className='ekodi-provider-context';
    const zones=[{name:'전체 Zone / 도메인',status:''},...(cf.zones||[])];
    const workers=(cf.workers||[]).filter(item=>item.allowed!==false);
    context.innerHTML=`
      <div><label>Cloudflare 계정</label><select data-ekodi-cf-account ${providerData?'':'disabled'}><option>${esc(cf.account?.name||'연결 확인 필요')}</option></select></div>
      <div><label>Zone / 도메인</label><select data-ekodi-cf-zone ${providerData?'':'disabled'}>${zones.map(zone=>`<option value="${esc(zone.name)}">${esc(zone.name)}${zone.status?` · ${esc(zone.status)}`:''}</option>`).join('')}</select></div>
      <div><label>대상 Worker</label><select data-ekodi-cf-worker ${workers.length?'':'disabled'}>${workers.length?workers.map(worker=>`<option value="${esc(worker.name)}">${esc(worker.name)}</option>`).join(''):'<option>Worker 확인 필요</option>'}</select></div>
      ${diagnosticMarkup()}
      <div class="ekodi-provider-note">계정 → Zone/도메인 → Worker 순서로 현재 위치를 확인합니다. Worker는 Zone에 종속되지 않을 수 있습니다. 권한·Account ID·API 오류를 숨기지 않고 총괄 AI가 원인을 구분해 표시합니다.</div>`;
    card.prepend(context);bindRetry(context);
    const original=section.querySelector('[data-cloudflare-target]');
    const workerSelect=context.querySelector('[data-ekodi-cf-worker]');
    const sync=()=>{
      if(!original||!workerSelect?.value||!workers.length)return;
      const target=[...original.options].find(option=>option.value===workerSelect.value);
      if(target){original.value=workerSelect.value;original.dispatchEvent(new Event('change',{bubbles:true}))}
    };
    workerSelect?.addEventListener('change',sync);
    if(original)new MutationObserver(sync).observe(original,{childList:true,subtree:true});
    queueMicrotask(sync);
    const oldField=original?.closest('.admin-secret-field');
    if(oldField){oldField.style.display='none';oldField.setAttribute('aria-hidden','true')}
  }

  function providerCard(){
    const cf=providerData?.cloudflare||{};const gh=providerData?.github||{};
    const node=document.createElement('section');node.className='ekodi-control-plane-card';node.dataset.ekodiProviderCard='true';
    const cfWarnings=(cf.warnings||[]).length;
    const repos=gh.repositories||[];
    const stateClass=providerState.status==='ok'?(cfWarnings?'warn':''):(providerState.status==='loading'?'loading':providerState.status==='warn'?'warn':'error');
    node.innerHTML=`<h3>Infrastructure & Development Control Plane</h3><div class="ekodi-provider-grid">
      <div class="ekodi-provider-tile"><strong><span class="ekodi-provider-dot ${stateClass}" aria-hidden="true"></span>Cloudflare · ${esc(cf.account?.name||'연결 확인')}</strong><small>${esc((cf.zones||[]).length)} Zones · ${esc((cf.workers||[]).length)} Workers${cfWarnings?' · 일부 읽기권한 제한':''}</small></div>
      <div class="ekodi-provider-tile"><strong><span class="ekodi-provider-dot ${gh.warning?'warn':''}" aria-hidden="true"></span>GitHub · ${esc(gh.owner||'EKODI')}</strong><small>${repos.length} repositories · ${esc(gh.mode||'inventory')} · 변경은 GitOps/Actions 가드 사용</small></div>
      ${diagnosticMarkup()}
    </div><div class="ekodi-provider-note" style="margin-top:10px">총괄 AI가 인증 → API → Cloudflare 계정 → Zone → Worker → 권한 순서로 진단하고, 실패 원인을 숨기지 않습니다. DNS·Production Secret·강제 push·삭제 등 고위험 변경은 관리자 승인 없이 실행하지 않습니다.</div>`;
    bindRetry(node);
    return node;
  }

  function enhanceAiOps(force=false){
    const panel=document.querySelector('#aiOpsPanel');
    if(!panel)return;
    if(force)panel.querySelector('[data-ekodi-provider-card]')?.remove();
    if(panel.querySelector('[data-ekodi-provider-card]'))return;
    const card=providerCard();
    const head=panel.querySelector('.ai-ops-head');
    if(card)head?.insertAdjacentElement('afterend',card);
  }

  function enhanceAssist(){
    const view=document.querySelector('#ekodiAssistAi');
    if(!view||view.querySelector('.ekodi-specialist-switch'))return;
    const form=view.querySelector('form');if(!form)return;
    const box=document.createElement('div');box.className='ekodi-specialist-switch';
    box.innerHTML=`<label for="ekodiSpecialistSelect">대화 상대</label><select id="ekodiSpecialistSelect">${SPECIALISTS.map(item=>`<option value="${item.id}">${esc(item.label)}</option>`).join('')}</select><small data-specialist-detail>${esc(SPECIALISTS[0].detail)}</small><div class="ekodi-specialist-hint">기본은 총괄 AI입니다. 전문 AI를 선택하면 요청에 전문 역할을 명시하고, 총괄 AI가 필요한 협업·안전검토를 계속 조정합니다.</div>`;
    form.before(box);
    const select=box.querySelector('select');const detail=box.querySelector('[data-specialist-detail]');
    select.value=selectedSpecialist;
    select.addEventListener('change',()=>{selectedSpecialist=select.value;const item=SPECIALISTS.find(entry=>entry.id===selectedSpecialist);if(detail)detail.textContent=item?.detail||''});
    form.addEventListener('submit',()=>{
      if(selectedSpecialist==='chief')return;
      const textarea=form.querySelector('textarea');if(!textarea)return;
      const item=SPECIALISTS.find(entry=>entry.id===selectedSpecialist);const text=textarea.value.trim();
      if(text&&!text.startsWith('[전문 AI:'))textarea.value=`[전문 AI: ${item?.label||selectedSpecialist}] ${text}`;
    },true);
  }

  function observe(){
    const observer=new MutationObserver(()=>{enhanceSecurity();enhanceAiOps();enhanceAssist()});
    observer.observe(document.documentElement,{childList:true,subtree:true});
    enhanceSecurity();enhanceAiOps();enhanceAssist();
  }

  installStyle();observe();loadProviders();
  window.addEventListener('ekodi-authenticated',loadProviders);
  window.addEventListener('ekodi-feature-installed',()=>{enhanceSecurity();enhanceAiOps();enhanceAssist()});
  window.EKODIAdminAIControlPlane=Object.freeze({specialists:Object.freeze(SPECIALISTS.map(item=>({...item}))),refresh:loadProviders,getProviderState:()=>({...providerState})});
})();
