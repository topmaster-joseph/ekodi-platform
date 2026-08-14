(() => {
  const API = 'https://mall-api.ekodi.kr';
  const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  if (!window.supabase) return;
  const sb = window.supabase.createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  const status = document.querySelector('#sourcingStatus');
  const member = document.querySelector('#sourcingMember');
  const policy = document.querySelector('#sourcingPolicy');
  const login = document.querySelector('#sourcingLogin');
  const logout = document.querySelector('#sourcingLogout');
  const sourceForm = document.querySelector('#sourceForm');
  const planForm = document.querySelector('#planForm');
  const providerSelect = document.querySelector('#providerSelect');
  const sourceSelect = document.querySelector('#sourceSelect');
  const productSelect = document.querySelector('#productSelect');
  const sourceList = document.querySelector('#sourceList');
  const planResult = document.querySelector('#planResult');
  let session = null;
  let sources = [];
  let products = [];

  const text = (value) => String(value ?? '').trim();
  const money = (value) => value === null || value === undefined ? '미확정' : `${new Intl.NumberFormat('ko-KR').format(Number(value) || 0)}원`;
  function setStatus(message, error = false) { if (status) { status.textContent = message; status.dataset.state = error ? 'error' : 'ok'; } }
  function node(tag, className = '', value = '') { const el = document.createElement(tag); if (className) el.className = className; if (value) el.textContent = value; return el; }
  function option(value, label) { const el = document.createElement('option'); el.value = value; el.textContent = label; return el; }

  async function token() { return (await sb.auth.getSession()).data.session?.access_token || ''; }
  async function api(path, options = {}) {
    const access = await token();
    if (!access) throw new Error('Google 판매자 로그인이 필요합니다.');
    const headers = new Headers(options.headers || {});
    headers.set('authorization', `Bearer ${access}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Mall API ${response.status}`);
    return body;
  }

  async function exchangeCentralToken() {
    const params = new URLSearchParams(location.hash.slice(1));
    const central = params.get('ekodi_token');
    if (!central) return;
    const type = params.get('ekodi_type') || 'email';
    const { error } = await sb.auth.verifyOtp({ token_hash: central, type });
    if (error) throw error;
    history.replaceState(null, '', location.pathname + location.search);
  }

  function sourceBadge(source) {
    if (source.fulfillmentMode === 'reference_only') return 'REFERENCE ONLY';
    if (source.fulfillmentMode === 'external_affiliate') return 'EXTERNAL CHECKOUT';
    if (source.rightsStatus === 'contract_verified') return source.orderPermission === 'api_approved' ? 'API APPROVED · GATED' : 'CONTRACT VERIFIED';
    return 'CONTRACT PENDING';
  }

  function renderSources() {
    sourceList.replaceChildren();
    sourceSelect.replaceChildren(option('', sources.length ? '소싱 후보 선택' : '등록된 후보 없음'));
    if (!sources.length) {
      const card = node('article', 'studio-preview-block'); card.append(node('small', '', 'EMPTY'), node('h3', '', '등록된 소싱 후보가 없습니다.'), node('p', '', '외부 참고, 제휴 또는 계약 공급자 후보를 등록하세요.')); sourceList.append(card); return;
    }
    for (const source of sources) {
      sourceSelect.append(option(source.id, `${source.internalLabel || source.providerName} · ${sourceBadge(source)}`));
      const card = node('article', 'studio-preview-block');
      card.append(node('small', '', sourceBadge(source)), node('h3', '', source.internalLabel || source.providerName || '소싱 후보'));
      card.append(node('p', '', `${source.providerName} · 공급가 ${money(source.costAmount)} · 배송비 ${money(source.shippingAmount)} · ${source.stockState}`));
      const link = node('a', 'smallbtn', '원본/공급처 열기'); link.href = source.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
      const remove = node('button', 'smallbtn', '삭제'); remove.type = 'button'; remove.addEventListener('click', () => removeSource(source.id));
      const actions = node('div', 'studio-buttons'); actions.append(link, remove); card.append(actions); sourceList.append(card);
    }
  }

  function renderProducts() {
    productSelect.replaceChildren(option('', products.length ? '내 상품 선택' : '서버 저장 상품 없음'));
    for (const item of products) productSelect.append(option(item.id, `${item.product?.name || '상품'} · ${money(item.product?.price)}`));
  }

  async function loadAll() {
    if (!session) return;
    const [providersResult, sourcesResult, productsResult, policyResult] = await Promise.all([
      api('/api/sourcing/providers'), api('/api/sourcing/sources'), api('/api/products'), api('/api/sourcing/policy')
    ]);
    providerSelect.replaceChildren();
    for (const p of providersResult.providers || []) {
      const label = p.id === 'auction-reference' ? `${p.displayName} · 참고 전용` : p.id === 'external-affiliate' ? `${p.displayName} · 외부결제` : `${p.displayName} · 승인 필요`;
      providerSelect.append(option(p.id, label));
    }
    sources = sourcesResult.sources || [];
    products = productsResult.products || [];
    renderSources(); renderProducts();
    if (policy) policy.textContent = policyResult.principles?.autoOrder ? '자동발주 게이트 ON' : 'Auto Source는 Dry-run · 자동발주 OFF';
    setStatus(`연결됨 · 소싱 후보 ${sources.length}개 · 상품 ${products.length}개`);
  }

  async function createSource(event) {
    event.preventDefault();
    const f = event.currentTarget.elements;
    try {
      const body = await api('/api/sourcing/sources', { method: 'POST', body: JSON.stringify({
        providerId: f.providerId.value, sourceUrl: f.sourceUrl.value, internalLabel: f.internalLabel.value, sourceRef: f.sourceRef.value,
        costAmount: f.costAmount.value, shippingAmount: f.shippingAmount.value, stockState: f.stockState.value
      }) });
      setStatus(body.notice || '소싱 후보를 등록했습니다.');
      event.currentTarget.reset();
      if (event.currentTarget.elements.shippingAmount) event.currentTarget.elements.shippingAmount.value = '0';
      await loadAll();
    } catch (error) { setStatus(error.message, true); }
  }

  async function removeSource(id) {
    try { await api(`/api/sourcing/sources/${encodeURIComponent(id)}`, { method: 'DELETE' }); await loadAll(); setStatus('소싱 후보를 삭제했습니다.'); }
    catch (error) { setStatus(error.message, true); }
  }

  async function linkSelected() {
    const f = planForm.elements;
    if (!f.productId.value || !f.sourceId.value) return setStatus('상품과 소싱 후보를 모두 선택해 주세요.', true);
    try {
      await api(`/api/sourcing/products/${encodeURIComponent(f.productId.value)}/sources`, { method: 'POST', body: JSON.stringify({
        sourceId: f.sourceId.value, priority: f.priority.value, minMarginAmount: f.minMarginAmount.value, minMarginPercent: f.minMarginPercent.value
      }) });
      setStatus('상품과 공급처 후보를 연결했습니다.');
    } catch (error) { setStatus(error.message, true); }
  }

  function resultCard(label, title, body) { const card = node('article', 'studio-preview-block'); card.append(node('small', '', label), node('h3', '', title), node('p', '', body)); return card; }
  async function runPlan(event) {
    event.preventDefault();
    const f = event.currentTarget.elements;
    if (!f.productId.value) return setStatus('상품을 선택해 주세요.', true);
    try {
      const result = await api(`/api/sourcing/products/${encodeURIComponent(f.productId.value)}/plan`, { method: 'POST', body: JSON.stringify({ feeRatePercent: f.feeRatePercent.value }) });
      planResult.replaceChildren();
      planResult.append(resultCard('DRY-RUN', `${result.product.name} · ${money(result.product.saleAmount)}`, `예상 경로수수료 ${result.feeRatePercent}% · 자동발주 ${result.autoOrderEnabled ? 'ON' : 'OFF'}`));
      if (!result.candidates?.length) planResult.append(resultCard('NO SOURCE', '연결된 공급처가 없습니다.', '먼저 “상품에 공급처 연결”을 눌러 주세요.'));
      for (const candidate of result.candidates || []) {
        const e = candidate.economics;
        const economic = e ? `공급+배송 ${money(e.landedCost)} · 플랫폼 ${money(e.platformFeeAmount)} · 예상기여 ${money(e.contributionMargin)} (${e.contributionMarginPercent}%)` : '공급원가 미확정';
        planResult.append(resultCard(candidate.eligible ? 'ELIGIBLE' : candidate.execution.mode.toUpperCase(), candidate.source.internalLabel || candidate.source.providerName, `${economic} · ${candidate.reason}`));
      }
      setStatus(result.selected ? `Dry-run 완료 · 후보 ${result.selected.source.internalLabel || result.selected.source.providerName}` : 'Dry-run 완료 · 현재 자동선정 가능한 공급처가 없습니다.');
    } catch (error) { setStatus(error.message, true); }
  }

  function syncSessionUi() {
    const signed = Boolean(session);
    if (member) member.textContent = signed ? `${session.user.email || 'Google 회원'} · Seller` : '로그인 필요';
    if (login) login.hidden = signed;
    if (logout) logout.hidden = !signed;
    document.querySelectorAll('#sourceRegister fieldset,#autoSource fieldset,#sourceRegister button,#autoSource button').forEach((el) => { el.disabled = !signed; });
  }

  login?.addEventListener('click', () => { location.href = 'https://auth.ekodi.kr/?site=mall-seller&returnTo=https%3A%2F%2Fmall.ekodi.kr%2Fsourcing'; });
  logout?.addEventListener('click', async () => { await sb.auth.signOut(); session = null; syncSessionUi(); setStatus('로그아웃했습니다.'); });
  sourceForm?.addEventListener('submit', createSource);
  planForm?.addEventListener('submit', runPlan);
  document.querySelector('#linkSource')?.addEventListener('click', linkSelected);
  document.querySelector('#reloadSources')?.addEventListener('click', () => loadAll().catch((error) => setStatus(error.message, true)));

  exchangeCentralToken().catch((error) => setStatus(`인증 연결 실패: ${error.message}`, true)).finally(async () => {
    session = (await sb.auth.getSession()).data.session;
    syncSessionUi();
    if (session) loadAll().catch((error) => setStatus(error.message, true));
  });
  sb.auth.onAuthStateChange((_event, next) => { session = next; syncSessionUi(); if (session) loadAll().catch(() => {}); });
})();
