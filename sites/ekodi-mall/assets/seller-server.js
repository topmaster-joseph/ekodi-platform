(() => {
  const API = '/ekodimall/api';
  const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const form = document.querySelector('#sellerDraftForm');
  if (!form || !window.supabase) return;
  const sb = window.supabase.createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  const status = document.querySelector('#draftStatus');
  const shareLinkStatus = document.querySelector('#shareLinkStatus');
  const shareLinkPreview = document.querySelector('#shareLinkPreview');
  const studioButtons = form.querySelector('.studio-buttons');
  let lastServerProduct = null;

  const text = (value) => String(value || '').trim();
  const list = (value) => text(value).split(/[\n,]/).map((item) => item.trim()).filter(Boolean).slice(0, 5);
  const money = (value) => `${new Intl.NumberFormat('ko-KR').format(Math.max(0, Number(value) || 0))}원`;

  async function accessToken() {
    const { data } = await sb.auth.getSession();
    return data.session?.access_token || '';
  }

  async function api(path, options = {}) {
    const token = await accessToken();
    if (!token) throw new Error('Google 판매자 로그인이 필요합니다.');
    const headers = new Headers(options.headers || {});
    headers.set('authorization', `Bearer ${token}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Mall API ${response.status}`);
    return body;
  }

  function selectedRegion() {
    const option = form.elements.primaryRegionId?.selectedOptions?.[0];
    const primaryRegionId = text(option?.value);
    if (!primaryRegionId) return null;
    return {
      primaryRegionId,
      regionIds: text(option.dataset.path).split(',').map((item) => text(item)).filter((item) => item && item !== 'kr'),
      label: text(option.dataset.fullName || option.textContent),
      relationship: 'seller-declared',
      verified: false
    };
  }

  function payload() {
    const v = Object.fromEntries([...form.querySelectorAll('[name]')].map((field) => [field.name, text(field.value)]));
    const sellerName = v.sellerDisplayName || '판매자';
    const productName = v.productName || '';
    const audience = v.audience || '';
    const benefits = list(v.benefits);
    const store = v.storeName ? { name: v.storeName, slug: v.storeSlug, contact: v.contact } : null;
    return {
      seller: { type: v.sellerType || 'individual', displayName: sellerName },
      store,
      product: {
        saleType: v.saleType || 'direct', category: v.category || 'general', region: selectedRegion(), name: productName, audience, oneLine: v.oneLine,
        price: v.price ? Number(v.price) : null, stockQuantity: v.saleType === 'affiliate' || v.saleType === 'inquiry' ? null : (v.stockQuantity === '' || v.stockQuantity === undefined ? null : Number(v.stockQuantity)), expiryDate: v.saleType === 'affiliate' || v.saleType === 'inquiry' ? '' : (v.expiryDate || ''), benefits, specs: list(v.specs), story: v.story, fulfillment: v.fulfillment,
        contact: v.contact, affiliateUrl: v.affiliateUrl, action: { url: v.saleType === 'affiliate' ? v.affiliateUrl : '' },
        source: v.sourceKind !== undefined ? { kind: v.sourceKind, name: v.sourceName, contact: v.sourceContact, public: form.elements.sourcePublic?.checked ? 1 : 0 } : undefined
      },
      content: {
        headline: v.oneLine,
        detailIntro: `${productName || '상품'}은(는) ${audience || '필요한 고객'}에게 ${benefits[0] || '분명한 쓰임'}을 제안하는 상품입니다.`,
        socialCaption: `${store?.name || sellerName} · ${productName}\n${v.oneLine}`.trim(),
        shortsOutline: [`0-3초: ${audience || '고객'}의 필요 제시`, `4-12초: ${productName || '상품'} 핵심 장점 소개`, '13-20초: 실제 사용 장면 또는 상품 이야기', '21-25초: 에코디몰 고유링크 안내']
      }
    };
  }

  const isServerId = (value) => /^prd_[a-f0-9]{32}$/i.test(text(value));
  function setStatus(message, error = false) {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = error ? 'error' : 'ok';
  }

  function renderLink(product) {
    lastServerProduct = product || null;
    const active = Boolean(product?.publicShareLinkActive);
    if (shareLinkStatus) shareLinkStatus.textContent = product ? `${active ? '공개 링크 활성' : '서버 저장됨 · 게시 전'} · ${product.shareCode}` : '서버 저장 후 고유링크 발급';
    if (shareLinkPreview) shareLinkPreview.textContent = product
      ? `${product.publicUrl}${active ? ' · 일반 Mall 경로는 8%, 판매자 직접공유는 별도 추적링크를 발급합니다.' : ' · 게시하면 외부 공유 가능'}`
      : 'Mall 전용 서버에 저장하면 상품별 고유링크가 발급됩니다.';
    document.querySelectorAll('[data-server-share-action]').forEach((button) => { button.disabled = !active; });
    const open = document.querySelector('[data-server-open-link]');
    if (open) { open.hidden = !active; open.href = active ? product.publicUrl : '#'; }
  }

  function fillForm(product) {
    const p = product.product || {};
    const s = product.seller || {};
    const store = product.store || {};
    const values = {
      productId: product.id, sellerType: s.type || 'individual', sellerDisplayName: s.displayName || '', contact: p.contact || store.contact || '',
      saleType: p.saleType || 'direct', productName: p.name || '', category: p.category || 'general', primaryRegionId: p.region?.primaryRegionId || '', price: p.price ?? '', stockQuantity: p.stockQuantity ?? '', expiryDate: p.expiryDate || '', affiliateUrl: p.affiliateUrl || '',
      storeName: store.name || '', storeSlug: store.slug || '', audience: p.audience || '', oneLine: p.oneLine || '', benefits: (p.benefits || []).join('\n'),
      story: p.story || '', specs: (p.specs || []).join('\n'), fulfillment: p.fulfillment || '',
      sourceKind: product.source?.kind || '', sourceName: product.source?.name || '', sourceContact: product.source?.contact || ''
    };
    for (const [name, value] of Object.entries(values)) {
      const field = form.elements[name];
      if (!field) continue;
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (form.elements.sourcePublic) { form.elements.sourcePublic.checked = Boolean(product.source?.public); form.elements.sourcePublic.dispatchEvent(new Event('change', { bubbles: true })); }
    renderLink(product);
    setStatus(`서버 상품을 불러왔습니다 · ${product.status === 'published' ? '게시 중' : '초안'}`);
  }

  async function saveServer() {
    const currentId = text(form.elements.productId?.value);
    setStatus('Mall 서버에 상품을 저장하고 있습니다...');
    const body = JSON.stringify(payload());
    const result = isServerId(currentId)
      ? await api(`/api/products/${encodeURIComponent(currentId)}`, { method: 'PUT', body })
      : await api('/api/products', { method: 'POST', body });
    const product = result.product;
    if (form.elements.productId) {
      form.elements.productId.value = product.id;
      form.elements.productId.dispatchEvent(new Event('input', { bubbles: true }));
    }
    renderLink(product);
    setStatus(`서버 저장 완료 · ${product.id}`);
    await loadDashboard();
    return product;
  }

  async function publishServer() {
    let id = text(form.elements.productId?.value);
    if (!isServerId(id)) id = (await saveServer()).id;
    else await saveServer();
    setStatus('상품을 게시하고 고유링크를 활성화하고 있습니다...');
    const result = await api(`/api/products/${encodeURIComponent(id)}/publish`, { method: 'POST' });
    renderLink(result.product);
    setStatus('게시 완료 · 일반 상품링크와 판매자 직접공유링크를 구분해 사용할 수 있습니다.');
    await loadDashboard();
  }

  async function directShareLink(channel) {
    if (!lastServerProduct?.publicShareLinkActive) throw new Error('상품을 먼저 게시해 주세요.');
    const result = await api(`/api/products/${encodeURIComponent(lastServerProduct.id)}/share-links`, {
      method: 'POST',
      body: JSON.stringify({ channel })
    });
    return result.shareLink;
  }

  async function copyDirectLink() {
    const link = await directShareLink('copy');
    await navigator.clipboard.writeText(link.url);
    setStatus('판매자 직접공유 7% 추적링크를 복사했습니다.');
  }

  async function nativeDirectShare() {
    const link = await directShareLink('share');
    const data = {
      title: lastServerProduct.product?.name || 'EKODI MALL 상품',
      text: lastServerProduct.product?.oneLine || '',
      url: link.url
    };
    if (navigator.share) await navigator.share(data).catch(() => {});
    else {
      await navigator.clipboard.writeText(link.url);
      setStatus('판매자 직접공유 7% 추적링크를 복사했습니다.');
    }
  }

  async function smsDirectShare() {
    const link = await directShareLink('sms');
    location.href = `sms:?&body=${encodeURIComponent(`${lastServerProduct.product?.name || '상품'}\n${link.url}`)}`;
  }

  function ensureUi() {
    if (studioButtons && !document.querySelector('[data-server-save]')) {
      const save = document.createElement('button');
      save.type = 'button'; save.className = 'btn primary'; save.dataset.serverSave = ''; save.textContent = '서버에 저장';
      const publish = document.createElement('button');
      publish.type = 'button'; publish.className = 'btn ghost'; publish.dataset.serverPublish = ''; publish.textContent = '게시 · 링크 활성화';
      studioButtons.prepend(publish); studioButtons.prepend(save);
      save.addEventListener('click', () => saveServer().catch((error) => setStatus(error.message, true)));
      publish.addEventListener('click', () => publishServer().catch((error) => setStatus(error.message, true)));
    }

    const linkBlock = shareLinkPreview?.closest('.studio-preview-block');
    if (linkBlock && !linkBlock.querySelector('[data-server-share-actions]')) {
      const note = document.createElement('p');
      note.className = 'studio-local-note';
      note.textContent = '아래 공유버튼은 서버가 판매자 직접유입으로 서명한 7% 추적링크를 발급합니다. “일반 상품링크”는 Mall 기본 8% 경로입니다.';
      const actions = document.createElement('div');
      actions.className = 'studio-buttons';
      actions.dataset.serverShareActions = '';
      actions.innerHTML = '<button class="smallbtn" type="button" data-server-share-action="copy" disabled>직접링크 복사 · 7%</button><button class="smallbtn" type="button" data-server-share-action="share" disabled>직접 공유 · 7%</button><button class="smallbtn" type="button" data-server-share-action="sms" disabled>문자 · 7%</button><a class="smallbtn" data-server-open-link href="#" target="_blank" rel="noopener" hidden>일반 상품링크 · 8%</a>';
      linkBlock.append(note, actions);
      actions.querySelector('[data-server-share-action="copy"]').addEventListener('click', () => copyDirectLink().catch((error) => setStatus(error.message, true)));
      actions.querySelector('[data-server-share-action="share"]').addEventListener('click', () => nativeDirectShare().catch((error) => setStatus(error.message, true)));
      actions.querySelector('[data-server-share-action="sms"]').addEventListener('click', () => smsDirectShare().catch((error) => setStatus(error.message, true)));
    }

    const studio = document.querySelector('#studio');
    if (studio && !document.querySelector('#serverProducts')) {
      const section = document.createElement('section');
      section.className = 'studio-shell';
      section.id = 'serverProducts';
      section.innerHTML = '<div class="studio-intro"><div><p class="eyebrow">MY PRODUCTS</p><h2>내 등록 상품</h2><p>본인이 등록한 상품만 관리합니다. 전체 공급처 현황은 에코디몰 관리자에서 확인합니다.</p></div><div class="readiness-card"><small>상품 현황</small><strong data-server-api-status>확인 중</strong><p data-server-finance-status>주문·정산 확인 중</p></div></div><div class="seller-provider-tabs" data-server-provider-tabs></div><p class="seller-provider-summary" data-server-provider-summary aria-live="polite"></p><div class="seller-inventory-scroll" data-server-products aria-label="내 등록 상품 목록"></div>';
      studio.insertAdjacentElement('afterend', section);
    }
  }

  // Only products owned by the logged-in seller belong in Seller Studio.
  // Cross-seller and platform affiliate/bookstore inventory lives in Mall Admin.
  let providerOptions = [['all', '모든 공급처'], ['own','에코디 직접판매'],['domeggook','도매꾹·도매매'],['coupang','쿠팡파트너스'],['bookstore','에코디서점'],['agoda','아고다'],['tripcom','트립닷컴'],['external','기타 제휴']];
  let selectedProvider = 'all';
  let selectedStatus = 'all';
  let sellerProducts = [];
  let dashboardRevision = 0;
  let visibleLimit = 40;
  let catalogSearch = '';
  function supplierGroup(product) {
    const provider = String(product.supply?.provider || '').toLowerCase();
    if (provider === 'domeggook' || provider === 'domemae') return 'domeggook';
    if (provider === 'ownerclan') return 'ownerclan';
    if (provider) return 'external';
    if (product.source?.kind === 'consigned_merchant') return 'merchant';
    if (product.source?.kind === 'ekodi-bookstore') return 'bookstore';
    if (product.product?.saleType === 'inquiry') return 'inquiry';
    if (product.product?.saleType === 'affiliate') {
      let host = '';
      try { host = new URL(product.product.affiliateUrl || '').hostname.toLowerCase(); } catch {}
      if (host === 'coupang.com' || host.endsWith('.coupang.com') || host === 'coupa.ng') return 'coupang';
      if (host === 'amazon.com' || host.endsWith('.amazon.com') || host === 'amazon.co.jp' || host.endsWith('.amazon.co.jp') || host === 'amzn.to') return 'amazon';
      if (host === 'agoda.com' || host.endsWith('.agoda.com')) return 'agoda';
      if (host === 'trip.com' || host.endsWith('.trip.com')) return 'tripcom';
      return 'external';
    }
    return 'own';
  }
  function readiness(product) {
    if (product.status !== 'published') return '상품 준비중';
    if (product.product?.saleType === 'direct') return product.checkoutReady ? '판매 가능' : '상품 준비중';
    if (product.product?.saleType === 'affiliate') return '외부 구매 연결';
    return '상담 가능';
  }
  function renderProviderProducts() {
    const container = document.querySelector('[data-server-products]');
    const filters = document.querySelector('[data-server-provider-tabs]');
    const summary = document.querySelector('[data-server-provider-summary]');
    if (!container || !filters || !summary) return;
    const providerLabel = new Map(providerOptions);
    filters.replaceChildren();
    const supplier = document.createElement('select');
    supplier.setAttribute('aria-label','내 상품 공급처 필터');
    for (const [id, label] of providerOptions) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = label + ' · ' + sellerProducts.filter(p => id === 'all' || supplierGroup(p) === id).length + '건';
      option.selected = id === selectedProvider;
      supplier.append(option);
    }
    supplier.addEventListener('change', () => { selectedProvider = supplier.value; visibleLimit = 40; renderProviderProducts(); });
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = '내 상품 검색';
    search.setAttribute('aria-label','내 상품 검색');
    search.value = catalogSearch;
    search.addEventListener('input', () => { catalogSearch = search.value; visibleLimit = 40; drawRows(); });
    const tabs = document.createElement('div');
    tabs.className = 'seller-status-tabs';
    for (const [id,label] of [['all','전체'],['preparing','상품 준비중'],['ready','판매·구매 연결']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'seller-provider-tab';
      button.textContent = label;
      button.setAttribute('aria-pressed', String(id === selectedStatus));
      button.addEventListener('click', () => { selectedStatus = id; visibleLimit = 40; renderProviderProducts(); });
      tabs.append(button);
    }
    filters.append(supplier, search, tabs);
    const table = document.createElement('table');
    table.className = 'seller-inventory-table';
    const head = document.createElement('thead');
    const tr = document.createElement('tr');
    for (const title of ['상품명','공급처','분류','상태','가격','관리']) {
      const th = document.createElement('th');
      th.scope = 'col'; th.textContent = title; tr.append(th);
    }
    head.append(tr); table.append(head);
    const tbody = document.createElement('tbody');
    table.append(tbody);
    document.querySelector('[data-provider-more]')?.remove();
    container.replaceChildren(table);
    const more = document.createElement('button');
    more.type = 'button'; more.className = 'smallbtn'; more.dataset.providerMore = '';
    more.textContent = '상품 더 보기';
    more.addEventListener('click', () => { visibleLimit += 40; drawRows(); });
    container.after(more);
    function drawRows() {
      const query = catalogSearch.trim().toLocaleLowerCase('ko-KR');
      const visible = sellerProducts.filter(p => (selectedProvider === 'all' || supplierGroup(p) === selectedProvider)
        && (selectedStatus === 'all' || (selectedStatus === 'preparing' ? readiness(p) === '상품 준비중' : readiness(p) !== '상품 준비중'))
        && (!query || String(p.product?.name || '').toLocaleLowerCase('ko-KR').includes(query)));
      const preparing = sellerProducts.filter(p => readiness(p) === '상품 준비중').length;
      summary.textContent = `내 등록 상품 ${sellerProducts.length}건 · 상품 준비중 ${preparing}건 · 현재 ${visible.length}건 조회 · ${Math.min(visible.length,visibleLimit)}건 표시`;
      tbody.replaceChildren();
      for (const p of visible.slice(0,visibleLimit)) {
        const row = document.createElement('tr');
        const cell = value => { const td = document.createElement('td'); td.textContent = String(value ?? ''); row.append(td); return td; };
        const name = cell(p.product?.name || '상품');
        name.className = 'seller-product-name';
        cell(providerLabel.get(supplierGroup(p)) || '기타 공급처');
        cell(({book:'책·배움',living:'생활',gift:'선물',general:'일반'})[p.product?.category] || p.product?.category || '일반');
        cell(readiness(p));
        cell(p.product?.price == null ? '미정' : money(p.product.price));
        const actions = document.createElement('td');
        if (!p.readOnly) {
          const edit = document.createElement('button');
          edit.type = 'button'; edit.className = 'smallbtn'; edit.textContent = '수정';
          edit.addEventListener('click', () => { fillForm(p); window.location.hash = 'studio'; window.ekodiSellerWizardOpenEditor?.(); });
          actions.append(edit);
        } else actions.textContent = '조회 전용';
        if (p.publicShareLinkActive && p.publicUrl) {
          const link = document.createElement('a');
          link.className = 'smallbtn'; link.href = p.publicUrl; link.target = '_blank';
          link.rel = 'noopener'; link.textContent = '보기';
          actions.append(link);
        }
        row.append(actions); tbody.append(row);
      }
      if (!visible.length) {
        const row = document.createElement('tr');
        const td = document.createElement('td'); td.colSpan = 6;
        td.textContent = '해당 조건의 등록 상품이 없습니다. 새 상품은 상품등록 탭에서 시작하세요.';
        row.append(td); tbody.append(row);
      }
      more.hidden = visible.length <= visibleLimit;
    }
    drawRows();
  }
  async function loadProviderRegistry() {
    try {
      const response = await fetch('/ekodimall/assets/provider-registry.json',{cache:'no-store'});
      if (!response.ok) return;
      const data = await response.json();
      if (!Array.isArray(data.providers)) return;
      providerOptions = [['all','모든 공급처'],...data.providers.filter(p => /^[a-z0-9-]+$/.test(p.id)).map(p => [p.id,p.label])];
      renderProviderProducts();
    } catch { /* fallback to built-in choices */ }
  }

  function dashboardSummary(orders, settlement) {
    const financeStatus = document.querySelector('[data-server-finance-status]');
    if (!financeStatus) return;
    const paidOrders = (orders || []).filter((order) => order.status === 'paid').length;
    financeStatus.textContent = `주문 ${orders?.length || 0}건 · 결제완료 ${paidOrders}건 · 미지급 정산원장 ${money(settlement?.pendingAmount || 0)} · 실제 지급실행은 비활성`;
  }

  async function loadDashboard() {
    const revision = ++dashboardRevision;
    const container = document.querySelector('[data-server-products]');
    const apiStatus = document.querySelector('[data-server-api-status]');
    if (!container) return;
    try {
      const [productsResult, ordersResult, settlementsResult] = await Promise.all([
        api('/api/products'), api('/api/orders?limit=20'), api('/api/settlements')
      ]);
      if (revision !== dashboardRevision) return;
      sellerProducts = Array.isArray(productsResult.products) ? productsResult.products : [];
      renderProviderProducts();
      if (apiStatus) apiStatus.textContent = `내 등록 상품 ${sellerProducts.length}건`;
      dashboardSummary(ordersResult.orders || [], settlementsResult.settlement || {});
      const currentId = text(form.elements.productId?.value);
      if (isServerId(currentId)) {
        const current = productsResult.products?.find((product) => product.id === currentId);
        if (current) renderLink(current);
      }
    } catch (error) {
      if (revision !== dashboardRevision) return;
      if (apiStatus) apiStatus.textContent = '로그인 또는 API 확인 필요';
      if (!String(error.message).includes('로그인')) setStatus(error.message, true);
    }
  }

  window.ekodiSellerServer = { api, fillForm, loadDashboard, setStatus };
  ensureUi();
  loadProviderRegistry();
  sb.auth.onAuthStateChange((_event, session) => {
    if (session) { loadDashboard(); return; }
    dashboardRevision += 1;
    sellerProducts = [];
    selectedProvider = 'all';
    selectedStatus = 'all';
    catalogSearch = '';
    visibleLimit = 40;
    renderProviderProducts();
    renderLink(null);
    const apiStatus = document.querySelector('[data-server-api-status]');
    if (apiStatus) apiStatus.textContent = '로그인 후 확인';
    const finance = document.querySelector('[data-server-finance-status]');
    if (finance) finance.textContent = '로그인 후 주문·정산 확인';
  });
  window.setTimeout(loadDashboard, 600);
})();
