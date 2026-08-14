(() => {
  const API = 'https://mall-api.ekodi.kr';
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
        saleType: v.saleType || 'direct', category: v.category || 'local', name: productName, audience, oneLine: v.oneLine,
        price: v.price ? Number(v.price) : null, benefits, specs: list(v.specs), story: v.story, fulfillment: v.fulfillment,
        contact: v.contact, affiliateUrl: v.affiliateUrl, action: { url: v.saleType === 'affiliate' ? v.affiliateUrl : '' }
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
      saleType: p.saleType || 'direct', productName: p.name || '', category: p.category || 'local', price: p.price ?? '', affiliateUrl: p.affiliateUrl || '',
      storeName: store.name || '', storeSlug: store.slug || '', audience: p.audience || '', oneLine: p.oneLine || '', benefits: (p.benefits || []).join('\n'),
      story: p.story || '', specs: (p.specs || []).join('\n'), fulfillment: p.fulfillment || ''
    };
    for (const [name, value] of Object.entries(values)) {
      const field = form.elements[name];
      if (!field) continue;
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
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
      section.innerHTML = '<div class="studio-intro"><div><p class="eyebrow">MY SERVER PRODUCTS</p><h2>내 서버 저장 상품</h2><p>게시상품은 일반 Mall 링크와 판매자 직접공유 추적링크를 분리합니다. 주문·수수료·정산예정액도 Mall 서버가 기록합니다.</p></div><div class="readiness-card"><small>서버 상태</small><strong data-server-api-status>확인 중</strong><p data-server-finance-status>결제와 지급실행은 아직 비활성입니다.</p></div></div><div class="module-grid" data-server-products><article><span>SERVER</span><h3>로그인 후 확인</h3><p>Google 판매자 세션을 확인합니다.</p></article></div>';
      studio.insertAdjacentElement('afterend', section);
    }
  }

  function productCard(product) {
    const article = document.createElement('article');
    article.innerHTML = '<span></span><h3></h3><p></p><div class="studio-buttons"><button class="smallbtn" type="button">불러오기</button></div>';
    article.querySelector('span').textContent = product.status === 'published' ? 'PUBLISHED' : 'DRAFT';
    article.querySelector('h3').textContent = product.product?.name || '상품';
    article.querySelector('p').textContent = `${product.seller?.displayName || '판매자'} · ${product.store?.name || '개인상품'} · ${product.shareCode}`;
    article.querySelector('button').addEventListener('click', () => fillForm(product));
    if (product.publicShareLinkActive) {
      const link = document.createElement('a');
      link.className = 'smallbtn'; link.href = product.publicUrl; link.target = '_blank'; link.rel = 'noopener'; link.textContent = '일반링크 · 8%';
      article.querySelector('.studio-buttons').append(link);
    }
    return article;
  }

  function dashboardSummary(orders, settlement) {
    const financeStatus = document.querySelector('[data-server-finance-status]');
    if (!financeStatus) return;
    const paidOrders = (orders || []).filter((order) => order.status === 'paid').length;
    financeStatus.textContent = `주문 ${orders?.length || 0}건 · 결제완료 ${paidOrders}건 · 미지급 정산원장 ${money(settlement?.pendingAmount || 0)} · 실제 지급실행은 비활성`;
  }

  async function loadDashboard() {
    const container = document.querySelector('[data-server-products]');
    const apiStatus = document.querySelector('[data-server-api-status]');
    if (!container) return;
    try {
      const [productsResult, ordersResult, settlementsResult] = await Promise.all([
        api('/api/products'),
        api('/api/orders?limit=20'),
        api('/api/settlements')
      ]);
      container.replaceChildren();
      if (!productsResult.products?.length) {
        const empty = document.createElement('article');
        empty.innerHTML = '<span>EMPTY</span><h3>아직 서버 저장 상품이 없습니다.</h3><p>상품을 작성한 뒤 ‘서버에 저장’을 누르세요.</p>';
        container.append(empty);
      } else productsResult.products.forEach((product) => container.append(productCard(product)));
      if (apiStatus) apiStatus.textContent = `연결됨 · 상품 ${productsResult.products?.length || 0}개`;
      dashboardSummary(ordersResult.orders || [], settlementsResult.settlement || {});
      const currentId = text(form.elements.productId?.value);
      if (isServerId(currentId)) {
        const current = productsResult.products?.find((product) => product.id === currentId);
        if (current) renderLink(current);
      }
    } catch (error) {
      if (apiStatus) apiStatus.textContent = '로그인 또는 API 확인 필요';
      if (!String(error.message).includes('로그인')) setStatus(error.message, true);
    }
  }

  ensureUi();
  sb.auth.onAuthStateChange((_event, session) => { if (session) loadDashboard(); });
  window.setTimeout(loadDashboard, 600);
})();
