(() => {
  const API = 'https://mall-api.ekodi.kr';
  const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  if (!window.supabase) return;
  const sb = window.supabase.createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  const $ = (sel) => document.querySelector(sel);
  const status = $('#opsStatus'); const login = $('#opsLogin'); const logout = $('#opsLogout'); const reload = $('#opsReload');
  const partnerSelect = $('#partnerSelect'); const sellerSelect = $('#sellerSelect'); const existingSourceSelect = $('#existingSourceSelect');
  const partnerSourceSelect = $('#partnerSourceSelect'); const skuSourceSelect = $('#skuSourceSelect'); const skuSelect = $('#skuSelect'); const productSelect = $('#productSelect');
  const mappingRows = $('#mappingRows'); const summary = $('#opsSummary'); const gates = $('#opsGates'); const partnerReadiness = $('#partnerReadiness');
  let session = null; let context = { partners: [], sellers: [], sources: [], products: [], skus: [], mappings: [], gates: {} }; let selectedPartnerId = '';
  const transitions = {
    candidate: ['due_diligence','rejected'], due_diligence: ['contracted','rejected','suspended'], contracted: ['pilot_ready','suspended'],
    pilot_ready: ['pilot_active','suspended'], pilot_active: ['active','suspended'], active: ['suspended'],
    suspended: ['due_diligence','contracted','pilot_ready','pilot_active','active'], rejected: []
  };
  const labels = {
    candidate:'후보',due_diligence:'실사 중',contracted:'계약 검증',pilot_ready:'파일럿 준비',pilot_active:'파일럿 운영',active:'정식 운영',suspended:'중지',rejected:'거절',
    mapped:'연결됨',contract_verified:'계약검증',pilot:'파일럿',in_stock:'재고 있음',out_of_stock:'품절',unknown:'확인 전'
  };
  const money = (n) => n === null || n === undefined ? '미확정' : `${new Intl.NumberFormat('ko-KR').format(Number(n) || 0)}원`;
  const opt = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; return o; };
  function setStatus(message, error = false) { if (!status) return; status.textContent = message; status.dataset.state = error ? 'error' : 'ok'; }
  async function accessToken() { return (await sb.auth.getSession()).data.session?.access_token || ''; }
  async function api(path, options = {}) {
    const token = await accessToken();
    if (!token) throw new Error('운영자 Google 로그인이 필요합니다.');
    const headers = new Headers(options.headers || {}); headers.set('authorization', `Bearer ${token}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers }); const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Mall API ${response.status}`); return body;
  }
  async function exchangeCentralToken() {
    const params = new URLSearchParams(location.hash.slice(1)); const central = params.get('ekodi_token'); if (!central) return;
    const type = params.get('ekodi_type') || 'email'; const { error } = await sb.auth.verifyOtp({ token_hash: central, type }); if (error) throw error;
    history.replaceState(null, '', location.pathname + location.search);
  }
  function selectedPartner() { return context.partners.find((p) => p.id === selectedPartnerId) || null; }
  function partnerSources() { return context.sources.filter((s) => s.partnerId === selectedPartnerId); }
  function partnerSkus() { return context.skus.filter((s) => s.partnerId === selectedPartnerId); }
  function setForm(form, values) { if (!form) return; for (const [key, value] of Object.entries(values)) if (form.elements[key]) form.elements[key].value = value ?? ''; }
  function renderGates() {
    const g = context.gates || {}; const items = [['PAYMENT',g.paymentsEnabled],['PII RELEASE',g.buyerPiiReleaseEnabled],['FORWARD',g.supplierForwardEnabled],['AUTO ORDER',g.autoOrderEnabled]];
    gates.replaceChildren(...items.map(([name,on]) => { const a=document.createElement('article'); const s=document.createElement('small'); const b=document.createElement('strong'); s.textContent=name; b.textContent=on?'ON':'OFF'; a.append(s,b); return a; }));
  }
  function renderSummary() {
    const partners=context.partners.length, verified=context.sources.filter((s)=>['contract_verified','pilot','active'].includes(s.partnerMappingStatus)).length;
    const skus=context.skus.length, maps=context.mappings.length; const vals=[['PARTNERS',partners],['VERIFIED SOURCES',verified],['SKU',skus],['PRODUCT MAP',maps]];
    summary.replaceChildren(...vals.map(([k,v])=>{const a=document.createElement('article');const s=document.createElement('small');const b=document.createElement('strong');s.textContent=k;b.textContent=v;a.append(s,b);return a;}));
  }
  function renderPartners() {
    const previous=selectedPartnerId; partnerSelect.replaceChildren(opt('','Partner 선택'));
    for (const p of context.partners) partnerSelect.append(opt(p.id, `${p.displayName} · ${labels[p.onboardingStatus] || p.onboardingStatus}`));
    selectedPartnerId = context.partners.some((p)=>p.id===previous) ? previous : context.partners[0]?.id || '';
    partnerSelect.value=selectedPartnerId; renderPartnerDetail();
  }
  function renderPartnerDetail() {
    const p=selectedPartner(); const form=$('#partnerDetailsForm'); const t=$('#transitionStatus'); t.replaceChildren(opt('','다음 상태 선택'));
    if (!p) { if (form) form.reset(); partnerReadiness.textContent='Partner를 선택하세요.'; renderDependentSelects(); return; }
    setForm(form,{ displayName:p.displayName, legalName:p.legalName, businessVerificationRef:p.businessVerificationRef, masterContractRef:p.masterContractRef,
      piiProcessorRef:p.piiProcessorRef, returnsPolicyRef:p.returnsPolicyRef, csPolicyRef:p.csPolicyRef, pilotEvidenceRef:p.pilotEvidenceRef, statusNote:p.statusNote });
    for (const next of transitions[p.onboardingStatus] || []) t.append(opt(next, labels[next] || next));
    partnerReadiness.textContent=`${labels[p.onboardingStatus] || p.onboardingStatus} · 계약참조 ${p.contractReady?'완료':'미완료'} · Source ${p.sourceCount} · 검증 Source ${p.verifiedSourceCount} · SKU ${p.skuCount} · 상품매핑 ${p.productMappingCount} · Auto Order OFF`;
    renderDependentSelects();
  }
  function renderDependentSelects() {
    sellerSelect.replaceChildren(opt('','판매자 선택')); for (const s of context.sellers) sellerSelect.append(opt(s.sellerId, `${s.displayName || s.email} · ${s.email}`));
    existingSourceSelect.replaceChildren(opt('','기존 계약 Source 선택'));
    for (const s of context.sources.filter((x)=>!x.partnerId || x.partnerId===selectedPartnerId)) existingSourceSelect.append(opt(s.id, `${s.internalLabel || s.id} · ${s.sellerDisplayName || s.sellerEmail} · ${labels[s.rightsStatus] || s.rightsStatus}`));
    const ps=partnerSources(); partnerSourceSelect.replaceChildren(opt('','Source 선택')); skuSourceSelect.replaceChildren(opt('','Source 선택'));
    for (const s of ps) { const text=`${s.internalLabel || s.id} · ${s.sellerDisplayName || s.sellerEmail} · ${labels[s.partnerMappingStatus] || s.partnerMappingStatus || 'mapped'}`; partnerSourceSelect.append(opt(s.id,text)); skuSourceSelect.append(opt(s.id,text)); }
    skuSelect.replaceChildren(opt('','SKU 선택')); for (const s of partnerSkus()) skuSelect.append(opt(s.id, `${s.displayName} · ${s.skuCode} · ${money(s.costAmount)}`));
    renderProductsForSku(); renderMappings();
  }
  function renderProductsForSku() {
    const sku=context.skus.find((s)=>s.id===skuSelect.value); productSelect.replaceChildren(opt('','상품 선택')); if (!sku) return;
    for (const p of context.products.filter((x)=>x.sellerId===sku.sellerId)) productSelect.append(opt(p.id, `${p.name} · ${money(p.price)} · ${p.status}`));
  }
  function renderMappings() {
    mappingRows.replaceChildren(); const partner=selectedPartner(); const skus=new Map(context.skus.map((s)=>[s.id,s]));
    const rows=context.mappings.filter((m)=>skus.get(m.supplierSkuId)?.partnerId===selectedPartnerId);
    if (!rows.length) { const tr=document.createElement('tr'); const td=document.createElement('td'); td.colSpan=6; td.textContent='등록된 매핑이 없습니다.'; tr.append(td); mappingRows.append(tr); return; }
    for (const m of rows) { const sku=skus.get(m.supplierSkuId); const source=context.sources.find((s)=>s.id===m.sourceId); const tr=document.createElement('tr');
      for (const text of [partner?.displayName || '', labels[m.mappingStatus] || m.mappingStatus, source?.internalLabel || m.sourceId, sku ? `${sku.displayName} · ${sku.skuCode}` : m.supplierSkuId, m.productName, `${money(m.minMarginAmount)} / ${m.minMarginPercent}%`]) { const td=document.createElement('td'); td.textContent=text; tr.append(td); }
      mappingRows.append(tr); }
  }
  async function loadContext() {
    if (!session) return; const result=await api('/api/internal/supplier-pilot/context'); context=result.context || context; renderGates(); renderSummary(); renderPartners(); setStatus(`${result.actor || 'Mall Ops'} · Partner ${context.partners.length} · Auto Order OFF`);
  }
  async function post(path, body) { return api(path,{method:'POST',body:JSON.stringify(body)}); }
  $('#partnerCreateForm')?.addEventListener('submit', async (e)=>{e.preventDefault();const f=e.currentTarget.elements;try{const r=await post('/api/internal/supplier-partners',{partnerCode:f.partnerCode.value,displayName:f.displayName.value,legalName:f.legalName.value,providerType:f.providerType.value,statusNote:f.statusNote.value});selectedPartnerId=r.partner.id;e.currentTarget.reset();await loadContext();setStatus('Supplier Partner를 등록했습니다.');}catch(err){setStatus(err.message,true);}});
  $('#partnerDetailsForm')?.addEventListener('submit', async (e)=>{e.preventDefault();if(!selectedPartnerId)return setStatus('Partner를 선택해 주세요.',true);const f=e.currentTarget.elements;try{await post(`/api/internal/supplier-partners/${selectedPartnerId}/details`,{displayName:f.displayName.value,legalName:f.legalName.value,businessVerificationRef:f.businessVerificationRef.value,masterContractRef:f.masterContractRef.value,piiProcessorRef:f.piiProcessorRef.value,returnsPolicyRef:f.returnsPolicyRef.value,csPolicyRef:f.csPolicyRef.value,pilotEvidenceRef:f.pilotEvidenceRef.value,statusNote:f.statusNote.value});await loadContext();setStatus('Partner 검증정보를 저장했습니다.');}catch(err){setStatus(err.message,true);}});
  $('#transitionPartner')?.addEventListener('click', async ()=>{const next=$('#transitionStatus').value;if(!selectedPartnerId||!next)return setStatus('Partner와 다음 상태를 선택해 주세요.',true);try{await post(`/api/internal/supplier-partners/${selectedPartnerId}/transition`,{status:next});await loadContext();setStatus(`Partner 상태를 ${labels[next] || next}(으)로 전환했습니다.`);}catch(err){setStatus(err.message,true);}});
  $('#sourceCreateForm')?.addEventListener('submit', async (e)=>{e.preventDefault();if(!selectedPartnerId)return setStatus('Partner를 먼저 선택해 주세요.',true);const f=e.currentTarget.elements;try{await post(`/api/internal/supplier-partners/${selectedPartnerId}/create-source`,{sellerId:f.sellerId.value,sourceUrl:f.sourceUrl.value,internalLabel:f.internalLabel.value,sourceRef:f.sourceRef.value});e.currentTarget.reset();await loadContext();setStatus('판매자용 Partner Source를 생성했습니다.');}catch(err){setStatus(err.message,true);}});
  $('#attachSource')?.addEventListener('click', async ()=>{if(!selectedPartnerId||!existingSourceSelect.value)return setStatus('Partner와 Source를 선택해 주세요.',true);try{await post(`/api/internal/supplier-partners/${selectedPartnerId}/sources`,{sourceId:existingSourceSelect.value});await loadContext();setStatus('기존 Source를 Partner에 연결했습니다.');}catch(err){setStatus(err.message,true);}});
  $('#contractVerifyForm')?.addEventListener('submit', async (e)=>{e.preventDefault();if(!selectedPartnerId)return setStatus('Partner를 선택해 주세요.',true);const f=e.currentTarget.elements;if(!f.sourceId.value)return setStatus('Partner Source를 선택해 주세요.',true);try{await post(`/api/internal/supplier-partners/${selectedPartnerId}/sources/${f.sourceId.value}/verify-contract`,{csOwner:f.csOwner.value,shippingSlaDays:f.shippingSlaDays.value});await loadContext();setStatus('Partner 계약 참조를 Source 계약 스냅샷에 반영했습니다.');}catch(err){setStatus(err.message,true);}});
  $('#skuForm')?.addEventListener('submit', async (e)=>{e.preventDefault();if(!selectedPartnerId)return setStatus('Partner를 선택해 주세요.',true);const f=e.currentTarget.elements;try{await post(`/api/internal/supplier-partners/${selectedPartnerId}/skus`,{sourceId:f.sourceId.value,skuCode:f.skuCode.value,displayName:f.displayName.value,costAmount:f.costAmount.value,shippingAmount:f.shippingAmount.value,stockState:f.stockState.value});e.currentTarget.reset();if(e.currentTarget.elements.shippingAmount)e.currentTarget.elements.shippingAmount.value='0';await loadContext();setStatus('Supplier SKU를 등록하고 source 원가를 동기화했습니다.');}catch(err){setStatus(err.message,true);}});
  $('#mappingForm')?.addEventListener('submit', async (e)=>{e.preventDefault();const f=e.currentTarget.elements;if(!f.skuId.value||!f.productId.value)return setStatus('SKU와 동일 판매자 상품을 선택해 주세요.',true);try{await post(`/api/internal/supplier-skus/${f.skuId.value}/products`,{productId:f.productId.value,priority:f.priority.value,minMarginAmount:f.minMarginAmount.value,minMarginPercent:f.minMarginPercent.value});await loadContext();setStatus('SKU→상품 Pilot 매핑을 저장했습니다.');}catch(err){setStatus(err.message,true);}});
  partnerSelect?.addEventListener('change',()=>{selectedPartnerId=partnerSelect.value;renderPartnerDetail();}); skuSelect?.addEventListener('change',renderProductsForSku);
  login?.addEventListener('click',()=>{location.href='https://auth.ekodi.kr/?site=mall-seller&returnTo=https%3A%2F%2Fmall.ekodi.kr%2Fsupplier-ops';});
  logout?.addEventListener('click',async()=>{await sb.auth.signOut();session=null;syncUi();setStatus('로그아웃했습니다.');}); reload?.addEventListener('click',()=>loadContext().catch((e)=>setStatus(e.message,true)));
  function syncUi(){const signed=Boolean(session);if(login)login.hidden=signed;if(logout)logout.hidden=!signed;document.querySelectorAll('.ops-panel input,.ops-panel select,.ops-panel textarea,.ops-panel button').forEach((el)=>{el.disabled=!signed;});if(reload)reload.disabled=!signed;}
  exchangeCentralToken().catch((e)=>setStatus(`인증 연결 실패: ${e.message}`,true)).finally(async()=>{session=(await sb.auth.getSession()).data.session;syncUi();if(session)loadContext().catch((e)=>setStatus(e.message,true));});
  sb.auth.onAuthStateChange((_e,next)=>{session=next;syncUi();if(session)loadContext().catch(()=>{});});
})();
