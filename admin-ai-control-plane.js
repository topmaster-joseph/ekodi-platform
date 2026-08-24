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
  let selectedSpecialist='chief';

  function token(){try{return sessionStorage.getItem(TOKEN_KEY)||''}catch{return''}}
  function headers(){const value=token();return value?{authorization:`Bearer ${value}`}:{}}
  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  async function loadProviders(){
    if(!token())return null;
    try{
      const response=await fetch(`${API}/api/control/secrets/providers`,{headers:headers(),cache:'no-store'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      providerData=await response.json();
      enhanceSecurity();
      enhanceAiOps();
      return providerData;
    }catch(error){console.warn('[EKODI Control Plane] provider inventory unavailable',error);return null}
  }

  function installStyle(){
    if(document.querySelector('#ekodiControlPlaneStyle'))return;
    const style=document.createElement('style');style.id='ekodiControlPlaneStyle';style.textContent=`
      .ekodi-provider-context{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 12px;padding:12px;border:1px solid rgba(148,163,184,.22);border-radius:14px;background:rgba(15,23,42,.5)}
      .ekodi-provider-context label,.ekodi-specialist-switch label{display:block;font-size:11px;opacity:.72;margin-bottom:5px}.ekodi-provider-context select,.ekodi-specialist-switch select{width:100%;min-height:36px;border-radius:9px;border:1px solid rgba(148,163,184,.28);background:#111827;color:#e5e7eb;padding:0 9px}
      .ekodi-provider-note{grid-column:1/-1;font-size:11px;opacity:.72;line-height:1.5}.ekodi-control-plane-card{margin:12px 0;padding:14px;border:1px solid rgba(148,163,184,.2);border-radius:14px;background:rgba(15,23,42,.54)}
      .ekodi-control-plane-card h3{margin:0 0 10px;font-size:15px}.ekodi-provider-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ekodi-provider-tile{padding:10px;border-radius:11px;background:rgba(30,41,59,.72)}.ekodi-provider-tile strong{display:block;font-size:13px}.ekodi-provider-tile small{display:block;margin-top:5px;opacity:.72;line-height:1.45}.ekodi-provider-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#34d399;margin-right:6px}.ekodi-provider-dot.warn{background:#f59e0b}
      .ekodi-specialist-switch{margin:10px 0;padding:10px;border:1px solid rgba(148,163,184,.18);border-radius:12px}.ekodi-specialist-switch small{display:block;margin-top:5px;opacity:.7}.ekodi-specialist-hint{margin-top:7px;font-size:11px;opacity:.68;line-height:1.45}
      @media(max-width:760px){.ekodi-provider-context,.ekodi-provider-grid{grid-template-columns:1fr}.ekodi-provider-note{grid-column:auto}}
    `;document.head.appendChild(style);
  }

  function enhanceSecurity(){
    const section=document.querySelector('#ekodiAdminSecretGenerator');
    if(!section||!providerData)return;
    const card=section.querySelector('.admin-secret-auto-card');
    if(!card||card.querySelector('.ekodi-provider-context'))return;
    const cf=providerData.cloudflare||{};
    const context=document.createElement('div');context.className='ekodi-provider-context';
    const zones=[{name:'전체 Zone / 도메인',status:''},...(cf.zones||[])];
    const workers=(cf.workers||[]).filter(item=>item.allowed!==false);
    context.innerHTML=`
      <div><label>Cloudflare 계정</label><select data-ekodi-cf-account><option>${esc(cf.account?.name||'EKODI Cloudflare')}</option></select></div>
      <div><label>Zone / 도메인</label><select data-ekodi-cf-zone>${zones.map(zone=>`<option value="${esc(zone.name)}">${esc(zone.name)}${zone.status?` · ${esc(zone.status)}`:''}</option>`).join('')}</select></div>
      <div><label>대상 Worker</label><select data-ekodi-cf-worker>${workers.map(worker=>`<option value="${esc(worker.name)}">${esc(worker.name)}</option>`).join('')}</select></div>
      <div class="ekodi-provider-note">계정 → Zone/도메인 → Worker 순서로 현재 위치를 확인합니다. Worker는 한 Zone에 종속되지 않을 수 있어 Zone은 필터·연결맥락으로 사용합니다. 실제 Secret 대상은 허용된 Worker만 선택됩니다.</div>`;
    card.prepend(context);
    const original=section.querySelector('[data-cloudflare-target]');
    const workerSelect=context.querySelector('[data-ekodi-cf-worker]');
    const sync=()=>{
      if(!original||!workerSelect?.value)return;
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
    if(!providerData)return null;
    const cf=providerData.cloudflare||{};const gh=providerData.github||{};
    const node=document.createElement('section');node.className='ekodi-control-plane-card';node.dataset.ekodiProviderCard='true';
    const cfWarnings=(cf.warnings||[]).length;
    const repos=gh.repositories||[];
    node.innerHTML=`<h3>Infrastructure & Development Control Plane</h3><div class="ekodi-provider-grid">
      <div class="ekodi-provider-tile"><strong><span class="ekodi-provider-dot ${cfWarnings?'warn':''}"></span>Cloudflare · ${esc(cf.account?.name||'연결 확인')}</strong><small>${esc((cf.zones||[]).length)} Zones · ${esc((cf.workers||[]).length)} Workers${cfWarnings?' · 일부 읽기권한 제한':''}</small></div>
      <div class="ekodi-provider-tile"><strong><span class="ekodi-provider-dot ${gh.warning?'warn':''}"></span>GitHub · ${esc(gh.owner||'EKODI')}</strong><small>${repos.length} repositories · ${esc(gh.mode||'public')} inventory · 변경은 GitOps/Actions 가드 사용</small></div>
    </div><div class="ekodi-provider-note" style="margin-top:10px">총괄 AI가 공급자 상태를 먼저 읽고 전문 AI와 협업합니다. DNS·Production Secret·강제 push·삭제 등 고위험 변경은 관리자 승인 없이 실행하지 않습니다.</div>`;
    return node;
  }

  function enhanceAiOps(){
    const panel=document.querySelector('#aiOpsPanel');
    if(!panel||!providerData||panel.querySelector('[data-ekodi-provider-card]'))return;
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
  window.EKODIAdminAIControlPlane=Object.freeze({specialists:Object.freeze(SPECIALISTS.map(item=>({...item}))),refresh:loadProviders});
})();
