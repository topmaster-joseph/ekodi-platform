(() => {
  const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const DRAFT_KEY = 'ekodiMallSellerStudioDraftV3';
  const form = document.querySelector('#sellerDraftForm');
  if (!form || !window.supabase) return;

  const sb = window.supabase.createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  const fields = [...form.querySelectorAll('[name]')];
  const fieldsets = [...form.querySelectorAll('fieldset')];
  const studioButtons = [...form.querySelectorAll('button')];
  const status = document.querySelector('#draftStatus');
  const preview = document.querySelector('#productPreview');
  const jsonOutput = document.querySelector('#draftJson');
  const readiness = document.querySelector('#readinessBar');
  const readinessText = document.querySelector('#readinessText');
  const memberStatus = document.querySelector('#memberStatus');
  const memberEmail = document.querySelector('#memberEmail');
  const loginButton = document.querySelector('#sellerLogin');
  const logoutButton = document.querySelector('#sellerLogout');
  const affiliateField = document.querySelector('[data-affiliate-field]');
  let session = null;

  const userDraftKey = () => session?.user?.id ? `${DRAFT_KEY}:${session.user.id}` : null;

  function setMemberUi() {
    const signedIn = Boolean(session);
    fieldsets.forEach((fieldset) => { fieldset.disabled = !signedIn; });
    studioButtons.forEach((button) => { button.disabled = !signedIn; });
    if (loginButton) loginButton.hidden = signedIn;
    if (logoutButton) logoutButton.hidden = !signedIn;
    if (memberStatus) memberStatus.textContent = signedIn ? 'Free Member · 사용 가능' : '로그인 필요';
    if (memberEmail) memberEmail.textContent = signedIn
      ? `${session.user.email || 'Google 회원'} · 무료 플랜`
      : 'Google 인증 후 무료 플랜이 시작됩니다.';
    if (status && !signedIn) status.textContent = 'Google 로그인 후 무료로 사용할 수 있습니다.';
  }

  function readSaved() {
    const key = userDraftKey();
    if (!key) return {};
    try {
      const value = JSON.parse(localStorage.getItem(key) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  function values() {
    return Object.fromEntries(fields.map((field) => [field.name, field.value.trim()]));
  }

  function restore() {
    const saved = readSaved();
    fields.forEach((field) => {
      if (saved[field.name] !== undefined) field.value = saved[field.name];
    });
    syncCommerceFields();
  }

  function persist() {
    const key = userDraftKey();
    if (key) localStorage.setItem(key, JSON.stringify(values()));
  }

  function save(message = '무료 초안을 저장했습니다.') {
    if (!session) return login();
    persist();
    if (status) status.textContent = message;
    render();
  }

  function list(value) {
    return String(value || '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean).slice(0, 5);
  }

  function commerceAction(data) {
    if (data.saleType === 'affiliate') {
      return {
        type: 'affiliate',
        label: '외부 제휴 판매처에서 구매',
        url: data.affiliateUrl || '',
        checkout: 'external'
      };
    }
    if (data.saleType === 'direct') {
      return {
        type: 'direct',
        label: '에코디몰 판매 준비',
        url: '',
        checkout: 'ekodi-pending-verification'
      };
    }
    return {
      type: 'inquiry',
      label: '판매자에게 문의',
      url: data.contact || '',
      checkout: 'inquiry'
    };
  }

  function buildDraft() {
    const data = values();
    const benefits = list(data.benefits);
    const specs = list(data.specs);
    const audience = data.audience || '필요한 고객';
    const store = data.storeName || '새 스토어';
    const product = data.productName || '새 상품';
    const oneLine = data.oneLine || `${audience}을 위한 ${product}`;
    const story = data.story || `${store}가 이 상품을 소개하는 이유와 실제 사용 맥락을 기록해 주세요.`;
    const delivery = data.fulfillment || '배송·픽업 방식 확인 필요';
    const action = commerceAction(data);

    return {
      seller: {
        type: data.sellerType || 'business',
        googleVerified: Boolean(session),
        email: session?.user?.email || '',
        directSaleVerification: data.saleType === 'direct' ? 'required' : 'not-applicable'
      },
      store: {
        name: store,
        slug: data.storeSlug || '',
        contact: data.contact || '',
        status: 'draft'
      },
      product: {
        name: product,
        category: data.category || 'local',
        saleType: data.saleType || 'direct',
        audience,
        oneLine,
        price: data.price ? Number(data.price) : null,
        benefits,
        specs,
        story,
        fulfillment: delivery,
        status: 'draft',
        action
      },
      content: {
        headline: oneLine,
        detailIntro: `${product}은(는) ${audience}에게 ${benefits[0] || '분명한 쓰임'}을 제안하는 상품입니다.`,
        socialCaption: `${store} · ${product}\n${oneLine}\n${benefits.slice(0, 3).map((item) => `• ${item}`).join('\n')}`.trim(),
        shortsOutline: [
          `0–3초: ${audience}의 문제를 한 문장으로 제시`,
          `4–12초: ${product}의 핵심 장점 ${benefits[0] || '1가지'} 소개`,
          '13–20초: 실제 사용 장면 또는 상품 스토리',
          data.saleType === 'affiliate' ? '21–25초: 제휴 판매처에서 상품 확인 안내' : '21–25초: 에코디몰 스토어에서 더 알아보기'
        ]
      },
      membership: {
        plan: 'free',
        entitlementVerified: false,
        enabled: ['store-draft', 'product-draft', 'detail-structure', 'basic-social-draft', 'basic-shorts-outline'],
        paidReady: ['starter-ai', 'pro-ai-sourcing', 'business-ai']
      },
      meta: {
        generatedBy: 'EKODI Product Studio free draft',
        serverSaved: false,
        paymentReady: false,
        affiliateRoutingReady: data.saleType === 'affiliate' && Boolean(data.affiliateUrl)
      }
    };
  }

  function addPreviewBlock(parent, label, title, body) {
    const block = document.createElement('article');
    block.className = 'studio-preview-block';
    const small = document.createElement('small');
    small.textContent = label;
    const heading = document.createElement('h3');
    heading.textContent = title;
    const copy = document.createElement('p');
    copy.textContent = body;
    block.append(small, heading, copy);
    parent.append(block);
  }

  function render() {
    const draft = buildDraft();
    if (preview) {
      preview.replaceChildren();
      addPreviewBlock(preview, 'STORE', draft.store.name, `${draft.seller.type === 'business' ? '사업자' : '개인'} 판매자 · Free Member`);
      addPreviewBlock(preview, 'HERO', draft.product.name, draft.product.oneLine);
      addPreviewBlock(preview, 'COMMERCE', draft.product.saleType === 'affiliate' ? '외부 제휴판매' : draft.product.saleType === 'direct' ? '에코디몰 직접판매 준비' : '상담·문의형', draft.product.action.label);
      addPreviewBlock(preview, 'WHO', draft.product.audience, draft.content.detailIntro);
      addPreviewBlock(preview, 'STORY', '상품 뒤의 이야기', draft.product.story);
      addPreviewBlock(preview, 'FULFILLMENT', '받는 방법', draft.product.fulfillment);
      if (draft.product.benefits.length) addPreviewBlock(preview, 'BENEFITS', '핵심 장점', draft.product.benefits.join(' · '));
    }
    if (jsonOutput) jsonOutput.value = JSON.stringify(draft, null, 2);

    const required = ['storeName', 'storeSlug', 'productName', 'audience', 'oneLine', 'benefits', 'fulfillment', 'contact'];
    if (values().saleType === 'affiliate') required.push('affiliateUrl');
    const current = values();
    const completed = required.filter((key) => current[key]).length;
    const percent = Math.round((completed / required.length) * 100);
    if (readiness) readiness.style.width = `${percent}%`;
    if (readinessText) readinessText.textContent = `${percent}% · ${completed}/${required.length} 핵심 항목 입력`;
  }

  function syncCommerceFields() {
    const isAffiliate = form.elements.saleType?.value === 'affiliate';
    if (affiliateField) affiliateField.hidden = !isAffiliate;
    if (form.elements.affiliateUrl) form.elements.affiliateUrl.required = isAffiliate;
    render();
  }

  function downloadDraft() {
    if (!session) return login();
    const draft = buildDraft();
    const slug = draft.store.slug || 'seller-draft';
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ekodi-${slug}-product-draft.json`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (status) status.textContent = 'JSON 초안을 내보냈습니다.';
  }

  async function copyJson(button) {
    if (!session) return login();
    const text = JSON.stringify(buildDraft(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      const original = button.textContent;
      button.textContent = '복사 완료 ✓';
      window.setTimeout(() => { button.textContent = original; }, 1000);
    } catch {
      if (jsonOutput) {
        jsonOutput.focus();
        jsonOutput.select();
      }
    }
  }

  function login() {
    location.href = 'https://auth.ekodi.kr/?site=mall-seller';
  }

  async function exchangeCentralToken() {
    const params = new URLSearchParams(location.hash.slice(1));
    const token = params.get('ekodi_token');
    const type = params.get('ekodi_type') || 'email';
    if (!token) return;
    try {
      const { error } = await sb.auth.verifyOtp({ token_hash: token, type });
      if (error) throw error;
      history.replaceState(null, '', location.pathname + location.search);
    } catch (error) {
      console.error('mall seller central auth', error);
      if (status) status.textContent = 'Google 로그인 연결을 완료하지 못했습니다. 다시 로그인해 주세요.';
    }
  }

  async function refreshSession() {
    session = (await sb.auth.getSession()).data.session;
    setMemberUi();
    if (session) restore();
    render();
  }

  fields.forEach((field) => field.addEventListener('input', () => {
    if (!session) return;
    persist();
    if (status) status.textContent = 'Free · 입력 중 · 자동 임시저장';
    render();
  }));
  form.elements.saleType?.addEventListener('change', syncCommerceFields);
  document.querySelector('[data-studio-save]')?.addEventListener('click', () => save());
  document.querySelector('[data-studio-export]')?.addEventListener('click', downloadDraft);
  document.querySelector('[data-studio-copy]')?.addEventListener('click', (event) => copyJson(event.currentTarget));
  document.querySelector('[data-studio-clear]')?.addEventListener('click', () => {
    if (!session) return login();
    if (!window.confirm('이 Google 회원의 상품 초안을 지울까요?')) return;
    const key = userDraftKey();
    if (key) localStorage.removeItem(key);
    form.reset();
    syncCommerceFields();
    if (status) status.textContent = '새 무료 초안을 시작합니다.';
    render();
  });
  loginButton?.addEventListener('click', login);
  logoutButton?.addEventListener('click', async () => {
    await sb.auth.signOut();
    session = null;
    form.reset();
    setMemberUi();
    syncCommerceFields();
  });

  setMemberUi();
  exchangeCentralToken().then(refreshSession);
})();
