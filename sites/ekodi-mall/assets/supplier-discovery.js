(() => {
  const API='/ekodimall/api';
  const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
  const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  if(!window.supabase)return;
  const sb=window.supabase.createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  const $=(s)=>document.querySelector(s); const status=$('#discoveryStatus'); const login=$('#discoveryLogin'); const logout=$('#discoveryLogout'); const reload=$('#discoveryReload');
  const candidateSelect=$('#candidateSelect'),transitionSelect=$('#candidateTransition'),evidenceSelect=$('#evidenceSelect'),outreachSelect=$('#outreachSelect'),preflightOption=$('#preflightOption');
  const candidateRows=$('#candidateRows'),summary=$('#discoverySummary'),readiness=$('#candidateReadiness'),outreachPreview=$('#outreachPreview'),preflightResult=$('#preflightResult');
  let session=null, selectedCandidateId='', discoveryAuthorized=false, accessRevision=0;
  const blankContext=()=>({candidates:[],evidence:[],outreach:[],pilotOptions:[],preflights:[],policy:{}});
  let context=blankContext();
  const transitions={discovered:['screening','rejected'],screening:['shortlisted','rejected'],shortlisted:['outreach_ready','rejected'],outreach_ready:['contacted','rejected'],contacted:['due_diligence_ready','rejected'],due_diligence_ready:[],converted:[],rejected:[]};
  const labels={discovered:'발견',screening:'검토',shortlisted:'후보선정',outreach_ready:'연락준비',contacted:'연락완료',due_diligence_ready:'실사준비',converted:'Partner 전환',rejected:'제외',low:'낮음',medium:'중간',high:'높음'};
  const opt=(v,t)=>{const o=document.createElement('option');o.value=v;o.textContent=t;return o;};
  const money=(n)=>`${new Intl.NumberFormat('ko-KR').format(Number(n)||0)}원`;
  function setStatus(msg,error=false){status.textContent=msg;status.dataset.state=error?'error':'ok';}
  async function token(){return (await sb.auth.getSession()).data.session?.access_token||'';}
  async function api(path,options={}){const t=await token();if(!t)throw new Error('운영자 Google 로그인이 필요합니다.');const h=new Headers(options.headers||{});h.set('authorization',`Bearer ${t}`);if(options.body&&!h.has('content-type'))h.set('content-type','application/json');const r=await fetch(`${API}${path}`,{...options,headers:h});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error([b.error,(b.blockers||[]).join(', '),(b.missingEvidence||[]).join(', ')].filter(Boolean).join(' · ')||`Mall API ${r.status}`);return b;}
  async function post(path,body={}){return api(path,{method:'POST',body:JSON.stringify(body)});}
  async function exchangeCentralToken(){const p=new URLSearchParams(location.hash.slice(1));const central=p.get('ekodi_token');if(!central)return;const type=p.get('ekodi_type')||'email';const {error}=await sb.auth.verifyOtp({token_hash:central,type});if(error)throw error;history.replaceState(null,'',location.pathname+location.search);}
  function current(){return context.candidates.find((c)=>c.id===selectedCandidateId)||null;}
  function setForm(form,values){if(!form)return;for(const [k,v] of Object.entries(values))if(form.elements[k])form.elements[k].value=v??'';}
  function renderSummary(){const vals=[['등록 후보',context.candidates.length],['실사 준비',context.candidates.filter((c)=>c.status==='due_diligence_ready').length],['공급처 전환',context.candidates.filter((c)=>c.status==='converted').length],['사전 점검',context.preflights.length]];summary.replaceChildren(...vals.map(([k,v])=>{const a=document.createElement('article'),s=document.createElement('small'),b=document.createElement('strong');s.textContent=k;b.textContent=v;a.append(s,b);return a;}));}
  function renderCandidates(){const prev=selectedCandidateId;candidateSelect.replaceChildren(opt('','후보 선택'));for(const c of context.candidates)candidateSelect.append(opt(c.id,`${c.displayName} · ${c.totalScore}점 · ${labels[c.status]||c.status}`));selectedCandidateId=context.candidates.some((c)=>c.id===prev)?prev:context.candidates[0]?.id||'';candidateSelect.value=selectedCandidateId;renderCandidateDetail();renderCandidateTable();}
  function renderCandidateDetail(){const c=current();transitionSelect.replaceChildren(opt('','다음 상태'));evidenceSelect.replaceChildren(opt('','근거 선택'));outreachSelect.replaceChildren(opt('','작업 선택'));
    if(!c){readiness.textContent='후보를 선택하세요.';return;}
    setForm($('#assessmentForm'),{businessIdentityStatus:c.businessIdentityStatus,directShipStatus:c.directShipStatus,marginPercentEstimate:c.marginPercentEstimate,stockReliability:c.stockReliability,returnsCsStatus:c.returnsCsStatus,pilotSupportStatus:c.pilotSupportStatus,integrationCapability:c.integrationCapability,rightsClarity:c.rightsClarity,publicContactRef:c.publicContactRef});
    for(const s of transitions[c.status]||[])transitionSelect.append(opt(s,labels[s]||s));
    for(const e of context.evidence.filter((x)=>x.candidateId===c.id))evidenceSelect.append(opt(e.id,`${e.evidenceType} · ${e.verificationStatus} · ${e.confidence}%`));
    for(const o of context.outreach.filter((x)=>x.candidateId===c.id)){outreachSelect.append(opt(o.id,`${o.channel} · ${o.status}`));}
    const blockers=(c.criticalBlockers||[]).join(', ')||'없음';readiness.textContent=`${c.totalScore}점 · Risk ${labels[c.riskLevel]||c.riskLevel} · ${labels[c.status]||c.status} · Blocker: ${blockers}`;
    const latest=context.outreach.filter((x)=>x.candidateId===c.id)[0];if(latest)outreachPreview.textContent=`${latest.subjectDraft||''}\n\n${latest.messageDraft||''}`;
  }
  function renderCandidateTable(){candidateRows.replaceChildren();if(!context.candidates.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.textContent='등록된 후보가 없습니다.';tr.append(td);candidateRows.append(tr);return;}for(const c of context.candidates){const tr=document.createElement('tr');for(const text of [c.displayName,labels[c.status]||c.status,`${c.totalScore}점`,labels[c.riskLevel]||c.riskLevel,(c.criticalBlockers||[]).join(', ')||'없음',c.convertedPartnerId||'-']){const td=document.createElement('td');td.textContent=text;tr.append(td);}candidateRows.append(tr);}}
  function renderPreflightOptions(){preflightOption.replaceChildren(opt('','파일럿 구성 선택'));for(const p of context.pilotOptions){const key=[p.partnerId,p.sourceId,p.supplierSkuId,p.productId].join('|');preflightOption.append(opt(key,`${p.partnerName} · ${p.skuName} · ${p.productName} · ${money(p.price)}`));}}
  async function load(){
    if(!session){discoveryAuthorized=false;sync();return;}
    const revision=++accessRevision,actor=session.user?.id;
    discoveryAuthorized=false;sync();
    try{
      const r=await api('/api/internal/supplier-discovery/context');
      if(!session||revision!==accessRevision||session.user?.id!==actor)return;
      discoveryAuthorized=true;context=r.context||blankContext();
      renderSummary();renderCandidates();renderPreflightOptions();sync();
      setStatus(`등록 후보 ${context.candidates.length}개 · 자동 연락·결제·고객정보·자동발주 OFF`);
    }catch(err){
      if(revision!==accessRevision)return;
      discoveryAuthorized=false;sync();setStatus(err.message,true);throw err;
    }
  }
  $('#candidateCreateForm')?.addEventListener('submit',async(e)=>{e.preventDefault();const f=e.currentTarget.elements;try{const r=await post('/api/internal/supplier-candidates',{candidateCode:f.candidateCode.value,displayName:f.displayName.value,legalName:f.legalName.value,websiteUrl:f.websiteUrl.value,discoverySource:f.discoverySource.value,discoveryRef:f.discoveryRef.value,category:f.category.value,region:f.region.value,publicContactRef:f.publicContactRef.value});selectedCandidateId=r.candidate.id;e.currentTarget.reset();await load();setStatus('공급자 후보를 등록했습니다.');}catch(err){setStatus(err.message,true);}});
  $('#assessmentForm')?.addEventListener('submit',async(e)=>{e.preventDefault();if(!selectedCandidateId)return setStatus('후보를 선택해 주세요.',true);const f=e.currentTarget.elements;try{await post(`/api/internal/supplier-candidates/${selectedCandidateId}/assessment`,{businessIdentityStatus:f.businessIdentityStatus.value,directShipStatus:f.directShipStatus.value,marginPercentEstimate:f.marginPercentEstimate.value,stockReliability:f.stockReliability.value,returnsCsStatus:f.returnsCsStatus.value,pilotSupportStatus:f.pilotSupportStatus.value,integrationCapability:f.integrationCapability.value,rightsClarity:f.rightsClarity.value,publicContactRef:f.publicContactRef.value});await load();setStatus('평가를 저장하고 Evidence Score를 다시 계산했습니다.');}catch(err){setStatus(err.message,true);}});
  $('#transitionCandidate')?.addEventListener('click',async()=>{if(!selectedCandidateId||!transitionSelect.value)return setStatus('후보와 다음 상태를 선택해 주세요.',true);try{await post(`/api/internal/supplier-candidates/${selectedCandidateId}/transition`,{status:transitionSelect.value});await load();setStatus('후보 상태를 전환했습니다.');}catch(err){setStatus(err.message,true);}});
  $('#convertCandidate')?.addEventListener('click',async()=>{if(!selectedCandidateId)return setStatus('후보를 선택해 주세요.',true);try{const r=await post(`/api/internal/supplier-candidates/${selectedCandidateId}/convert`,{});await load();setStatus(`${r.partner.displayName}을 Supplier Partner 후보로 전환했습니다.`);}catch(err){setStatus(err.message,true);}});
  $('#evidenceForm')?.addEventListener('submit',async(e)=>{e.preventDefault();if(!selectedCandidateId)return setStatus('후보를 선택해 주세요.',true);const f=e.currentTarget.elements;try{await post(`/api/internal/supplier-candidates/${selectedCandidateId}/evidence`,{evidenceType:f.evidenceType.value,evidenceUrl:f.evidenceUrl.value,summary:f.summary.value});e.currentTarget.reset();await load();setStatus('공개 근거를 추가했습니다. 원문 전체는 복제하지 않습니다.');}catch(err){setStatus(err.message,true);}});
  $('#evidenceReviewForm')?.addEventListener('submit',async(e)=>{e.preventDefault();const f=e.currentTarget.elements;if(!f.evidenceId.value)return setStatus('근거를 선택해 주세요.',true);try{await post(`/api/internal/supplier-evidence/${f.evidenceId.value}/review`,{decision:f.decision.value,confidence:f.confidence.value});await load();setStatus('근거 판정을 저장했습니다.');}catch(err){setStatus(err.message,true);}});
  $('#outreachDraftForm')?.addEventListener('submit',async(e)=>{e.preventDefault();if(!selectedCandidateId)return setStatus('후보를 선택해 주세요.',true);const f=e.currentTarget.elements;try{const r=await post(`/api/internal/supplier-candidates/${selectedCandidateId}/outreach-draft`,{channel:f.channel.value,publicContactRef:f.publicContactRef.value});outreachPreview.textContent=`${r.outreach.subjectDraft}\n\n${r.outreach.messageDraft}`;await load();setStatus('연락 초안만 만들었습니다. 자동 발송하지 않습니다.');}catch(err){setStatus(err.message,true);}});
  $('#outreachStatusForm')?.addEventListener('submit',async(e)=>{e.preventDefault();const f=e.currentTarget.elements;if(!f.outreachId.value)return setStatus('연락 작업을 선택해 주세요.',true);try{await post(`/api/internal/supplier-outreach/${f.outreachId.value}/status`,{status:f.status.value,responseRef:f.responseRef.value});await load();setStatus('실제 연락 상태를 기록했습니다.');}catch(err){setStatus(err.message,true);}});
  $('#preflightForm')?.addEventListener('submit',async(e)=>{e.preventDefault();const f=e.currentTarget.elements;const parts=f.optionKey.value.split('|');if(parts.length!==4)return setStatus('파일럿 구성을 선택해 주세요.',true);try{const r=await post('/api/internal/supplier-preflight',{partnerId:parts[0],sourceId:parts[1],supplierSkuId:parts[2],productId:parts[3],scenarioSource:f.scenarioSource.value,quantity:f.quantity.value});const p=r.preflight;preflightResult.textContent=`${p.readinessStatus} · 매출 ${money(p.grossAmount)} · 수수료 ${p.feeRatePercent}% (${money(p.platformFeeAmount)}) · 공급가 ${money(p.supplierCostAmount)} · 배송 ${money(p.supplierShippingAmount)} · 기여이익 ${money(p.contributionMargin)} (${Number(p.contributionMarginPercent).toFixed(1)}%) · Blocker ${(p.blockers||[]).join(', ')||'없음'} · 실제 실행 ${p.executionAllowed?'허용':'잠김'}`;await load();setStatus('Pilot Preflight를 기록했습니다. 실제 주문은 자동 실행하지 않습니다.');}catch(err){setStatus(err.message,true);}});
  candidateSelect?.addEventListener('change',()=>{selectedCandidateId=candidateSelect.value;renderCandidateDetail();});
  // Tabs change only presentation; every mutation still requires the server's allowlist.
  const tabs=[...document.querySelectorAll('[data-discovery-tab]')];
  const panels=[...document.querySelectorAll('[data-discovery-panel]')];
  const allowed=new Set(tabs.map(tab=>tab.dataset.discoveryTab));
  function showTab(value,updateUrl=false){
    const selected=allowed.has(value)?value:'candidate';
    for(const tab of tabs){const active=tab.dataset.discoveryTab===selected;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
    for(const panel of panels)panel.hidden=panel.dataset.discoveryPanel!==selected;
    if(updateUrl){const url=new URL(location.href);if(selected==='candidate')url.searchParams.delete('tab');else url.searchParams.set('tab',selected);history.replaceState(null,'',url.pathname+url.search+url.hash);}
  }
  for(const [index,tab] of tabs.entries()){
    tab.addEventListener('click',()=>showTab(tab.dataset.discoveryTab,true));
    tab.addEventListener('keydown',event=>{
      let next=-1;
      if(event.key==='ArrowRight')next=(index+1)%tabs.length;
      else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=tabs.length-1;
      if(next<0)return;
      event.preventDefault();showTab(tabs[next].dataset.discoveryTab,true);tabs[next].focus();
    });
  }
  showTab(new URLSearchParams(location.search).get('tab'));
  window.addEventListener('popstate',()=>showTab(new URLSearchParams(location.search).get('tab')));
  login?.addEventListener('click',()=>{location.href='https://ekodi.kr/auth/?site=mall-seller&return_to='+encodeURIComponent(location.href.split('#')[0]);});
  logout?.addEventListener('click',async()=>{
    ++accessRevision;discoveryAuthorized=false;session=null;sync();
    try{await sb.auth.signOut();setStatus('로그아웃했습니다.');}
    catch(err){setStatus(`로그아웃 확인 실패: ${err.message}`,true);session=(await sb.auth.getSession()).data.session;if(session)load().catch(e=>setStatus(e.message,true));}
  });
  reload?.addEventListener('click',()=>load().catch(e=>setStatus(e.message,true)));
  function sync(){
    const signed=Boolean(session),canEdit=signed&&discoveryAuthorized;
    if(login)login.hidden=signed;
    if(logout)logout.hidden=!signed;
    document.querySelectorAll('.ops-panel input,.ops-panel select,.ops-panel textarea,.ops-panel button').forEach(el=>{el.disabled=!canEdit;});
    if(reload)reload.disabled=!signed;
    if(!canEdit){
      context=blankContext();selectedCandidateId='';
      renderSummary();renderCandidates();renderPreflightOptions();
      if(outreachPreview)outreachPreview.textContent='연락 초안은 로그인·권한 검증 후 확인할 수 있습니다.';
      if(preflightResult)preflightResult.textContent='파일럿 점검은 로그인·권한 검증 후 확인할 수 있습니다.';
    }
  }
  exchangeCentralToken().catch(e=>setStatus(`인증 연결 실패: ${e.message}`,true)).finally(async()=>{session=(await sb.auth.getSession()).data.session;discoveryAuthorized=false;sync();if(session)load().catch(e=>setStatus(e.message,true));});
  sb.auth.onAuthStateChange((_e,next)=>{
    if(session?.access_token===next?.access_token)return;
    ++accessRevision;session=next;discoveryAuthorized=false;sync();
    if(session)load().catch(e=>setStatus(e.message,true));
  });
})();
