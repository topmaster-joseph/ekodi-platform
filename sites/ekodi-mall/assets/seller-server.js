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
  let lastDirectLink = null;

  const text = (value) => String(value || '').trim();
  const list = (value) => text(value).split(/[\n,]/).map((item) => item.trim()).filter(Boolean).slice(0, 5);
  const isServerId = (value) => /^prd_[a-f0-9]{32}$/i.test(text(value));

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
    if (!response.ok) throw new Error(body.error || body.message || `Mall API ${response.status}`);
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
      seller: { type: v.sellerType || 'individual', displayName: sellerName, contact: v.contact },
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
  function setStatus(message, error = false) {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = error ? 'error' : 'ok';
  }
  function renderLink(product) {
    lastServerProduct = product || null;
    lastDirectLink = null;
    const active = Boolean(product?.publicShareLinkActive);
    if (shareLinkStatus) shareLinkStatus.textContent = product ? `${active ? '공개 상품 · 직접공유 가능' : '서버 저장됨 · 게시 전'} · ${product.shareCode}` : '서버 저장 후 고유링크 발급';
    if (shareLinkPreview) shareLinkPreview.textContent = product
      ? `${product.publicUrl}${active ? ' · Mall 유입 canonical 8% · 판매자 공유는 서버 발급 7% 링크 사용' : ' · 게시하면 공개'}`
      : 'Mall 전용 서버에 저장하면 상품별 공개주소가 발급됩니다.';
    document.querySelectorAll('[data-server-share-action]').forEach((button) => { button.disabled = !active; });
    const open = document.querySelector('[data-server-open-link]');
    if (open) { open.hidden = !active; open.href = active ? product.publicUrl : '#'; }
  }
  function fillForm(product) {
    const p = product.product || {}; const s = product.seller || {}; const store = product.store || {};
    const values = { productId: product.id, sellerType: s.type || 'individual', sellerDisplayName: s.displayName || '', contact: p.contact || store.contact || '', saleType: p.saleType || 'direct', productName: p.name || '', category: p.category || 'local', price: p.price ?? '', affiliateUrl: p.affiliateUrl || '', storeName: store.name || '', storeSlug: store.slug || '', audience: p.audience || '', oneLine: p.oneLine || '', benefits: (p.benefits || []).join('\n'), story: p.story || '', specs: (p.specs || []).join('\n'), fulfillment: p.fulfillment || '' };
    for (const [name, value] of Object.entries(values)) {
      const field = form.elements[name]; if (!field) continue; field.value = value; field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    renderLink(product);
    setStatus(`서버 상품을 불러왔습니다 · ${product.status === 'published' ? '게시 중' : '초안'}`);
  }
  async function saveServer() {
    const currentId = text(form.elements.productId?.value);
    setStatus('Mall 서버에 상품을 저장하고 있습니다...');
    const body = JSON.stringify(payload());
    const result = isServerId(currentId) ? await api(`/api/products/${encodeURIComponent(currentId)}`, { method: 'PUT', body }) : await api('/api/products', { method: 'POST', body });
    const product = result.product;
    if (form.elements.productId) { form.elements.productId.value = product.id; form.elements.productId.dispatchEvent(new Event('input', { bubbles: true })); }
    renderLink(product); setStatus(`서버 저장 완료 · ${product.id}`); await loadProducts(); return product;
  }
  async function publishServer() {
    let id = text(form.elements.productId?.value);
    if (!isServerId(id)) id = (await saveServer()).id; else await saveServer();
    setStatus('상품을 게시하고 공개주소를 활성화하고 있습니다...');
    const result = await api(`/api/products/${encodeURIComponent(id)}/publish`, { method: 'POST' });
    renderLink(result.product); setStatus('게시 완료 · Mall 노출과 판매자 직접공유를 사용할 수 있습니다.'); await loadProducts();
  }
  async function directLink(channel = 'copy') {
    if (!lastServerProduct?.publicShareLinkActive) throw new Error('상품을 먼저 게시해 주세요.');
    const result = await api(`/api/products/${encodeURIComponent(lastServerProduct.id)}/share-links`, { method: 'POST', body: JSON.stringify({ channel }) });
    lastDirectLink = result.link;
    return result.link;
  }
  async function copyLink() {
    const link = await directLink('copy');
    await navigator.clipboard.writeText(link.url);
    setStatus('7% 판매자 직접공유 링크를 복사했습니다. 이 링크의 첫 유입은 7일간 서버가 보존합니다.');
  }
  async function nativeShare() {
    const link = await directLink('share');
    const data = { title: lastServerProduct.product?.name || 'EKODI MALL 상품', text: lastServerProduct.product?.oneLine || '', url: link.url };
    if (navigator.share) await navigator.share(data).catch(() => {}); else { await navigator.clipboard.writeText(link.url); setStatus('7% 직접공유 링크를 복사했습니다.'); }
  }
  async function smsShare() {
    const link = await directLink('sms');
    location.href = `sms:?&body=${encodeURIComponent(`${lastServerProduct.product?.name || '상품'}\n${link.url}`)}`;
  }

  function ensureUi() {
    if (studioButtons && !document.querySelector('[data-server-save]')) {
      const save = document.createElement('button'); save.type = 'button'; save.className = 'btn primary'; save.dataset.serverSave = ''; save.textContent = '서버에 저장';
      const publish = document.createElement('button'); publish.type = 'button'; publish.className = 'btn ghost'; publish.dataset.serverPublish = ''; publish.textContent = '게시 · Mall 노출';
      studioButtons.prepend(publish); studioButtons.prepend(save);
      save.addEventListener('click', () => saveServer().catch((error) => setStatus(error.message, true)));
      publish.addEventListener('click', () => publishServer().catch((error) => setStatus(error.message, true)));
    }
    const linkBlock = shareLinkPreview?.closest('.studio-preview-block');
    if (linkBlock && !linkBlock.querySelector('[data-server-share-actions]')) {
      const actions = document.createElement('div'); actions.className = 'studio-buttons'; actions.dataset.serverShareActions = '';
      actions.innerHTML = '<button class="smallbtn" type="button" data-server-share-action="copy" disabled>7% 직접링크 복사</button><button class="smallbtn" type="button" data-server-share-action="share" disabled>직접 공유</button><button class="smallbtn" type="button" data-server-share-action="sms" disabled>문자</button><a class="smallbtn" data-server-open-link href="#" target="_blank" rel="noopener" hidden>8% Mall 공개페이지</a>';
      linkBlock.append(actions);
      actions.querySelector('[data-server-share-action="copy"]').addEventListener('click', () => copyLink().catch((error) => setStatus(error.message, true)));
      actions.querySelector('[data-server-share-action="share"]').addEventListener('click', () => nativeShare().catch((error) => setStatus(error.message, true)));
      actions.querySelector('[data-server-share-action="sms"]').addEventListener('click', () => smsShare().catch((error) => setStatus(error.message, true)));
    }
    const studio = document.querySelector('#studio');
    if (studio && !document.querySelector('#serverProducts')) {
      const section = document.createElement('section'); section.className = 'studio-shell'; section.id = 'serverProducts';
      section.innerHTML = '<div class="studio-intro"><div><p class="eyebrow">MY SERVER PRODUCTS</p><h2>내 서버 저장 상품</h2><p>브라우저 임시저장과 별도로 Mall 전용 D1에 저장됩니다. 게시한 상품은 Mall에서 발견될 수 있고, 직접공유는 별도 7% 링크를 발급합니다.</p></div><div class="readiness-card"><small>서버 상태</small><strong data-server-api-status>확인 중</strong><p>결제는 아직 비활성 상태입니다.</p></div></div><div class="module-grid" data-server-products><article><span>SERVER</span><h3>로그인 후 확인</h3><p>Google 판매자 세션을 확인합니다.</p></article></div>';
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
    if (product.publicShareLinkActive) { const link = document.createElement('a'); link.className = 'smallbtn'; link.href = product.publicUrl; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Mall 공개페이지'; article.querySelector('.studio-buttons').append(link); }
    return article;
  }
  async function loadProducts() {
    const container = document.querySelector('[data-server-products]'); const apiStatus = document.querySelector('[data-server-api-status]'); if (!container) return;
    try {
      const result = await api('/api/products'); container.replaceChildren();
      if (!result.products?.length) { const empty = document.createElement('article'); empty.innerHTML = '<span>EMPTY</span><h3>아직 서버 저장 상품이 없습니다.</h3><p>상품을 작성한 뒤 ‘서버에 저장’을 누르세요.</p>'; container.append(empty); }
      else result.products.forEach((product) => container.append(productCard(product)));
      if (apiStatus) apiStatus.textContent = `연결됨 · ${result.products?.length || 0}개`;
      const currentId = text(form.elements.productId?.value); if (isServerId(currentId)) { const current = result.products?.find((product) => product.id === currentId); if (current) renderLink(current); }
    } catch (error) {
      if (apiStatus) apiStatus.textContent = '로그인 또는 API 확인 필요';
      if (!String(error.message).includes('로그인')) setStatus(error.message, true);
    }
  }

  ensureUi();
  sb.auth.onAuthStateChange((_event, session) => { if (session) loadProducts(); });
  window.setTimeout(loadProducts, 600);
})();
