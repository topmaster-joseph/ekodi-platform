(() => {
  const KEY = 'ekodiMallSellerStudioDraftV2';
  const form = document.querySelector('#sellerDraftForm');
  if (!form) return;

  const fields = [...form.querySelectorAll('[name]')];
  const status = document.querySelector('#draftStatus');
  const preview = document.querySelector('#productPreview');
  const jsonOutput = document.querySelector('#draftJson');
  const readiness = document.querySelector('#readinessBar');
  const readinessText = document.querySelector('#readinessText');

  function readSaved() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || '{}');
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
  }

  function save(message = '브라우저에 임시 저장됨') {
    localStorage.setItem(KEY, JSON.stringify(values()));
    if (status) status.textContent = message;
    render();
  }

  function list(value) {
    return String(value || '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean).slice(0, 5);
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

    return {
      store: {
        name: store,
        slug: data.storeSlug || '',
        contact: data.contact || ''
      },
      product: {
        name: product,
        category: data.category || 'local',
        audience,
        oneLine,
        price: data.price ? Number(data.price) : null,
        benefits,
        specs,
        story,
        fulfillment: delivery,
        status: 'draft'
      },
      content: {
        headline: oneLine,
        detailIntro: `${product}은(는) ${audience}에게 ${benefits[0] || '분명한 쓰임'}을 제안하는 상품입니다.`,
        socialCaption: `${store} · ${product}\n${oneLine}\n${benefits.slice(0, 3).map((item) => `• ${item}`).join('\n')}`.trim(),
        shortsOutline: [
          `0–3초: ${audience}의 문제를 한 문장으로 제시`,
          `4–12초: ${product}의 핵심 장점 ${benefits[0] || '1가지'} 소개`,
          `13–20초: 실제 사용 장면 또는 스토리`,
          `21–25초: 에코디몰 스토어에서 더 알아보기`
        ]
      },
      meta: {
        generatedBy: 'EKODI Product Studio local draft',
        serverSaved: false,
        paymentReady: false
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
      addPreviewBlock(preview, 'HERO', draft.product.name, draft.product.oneLine);
      addPreviewBlock(preview, 'WHO', draft.product.audience, draft.content.detailIntro);
      addPreviewBlock(preview, 'STORY', '상품 뒤의 이야기', draft.product.story);
      addPreviewBlock(preview, 'FULFILLMENT', '받는 방법', draft.product.fulfillment);
      if (draft.product.benefits.length) addPreviewBlock(preview, 'BENEFITS', '핵심 장점', draft.product.benefits.join(' · '));
    }
    if (jsonOutput) jsonOutput.value = JSON.stringify(draft, null, 2);

    const required = ['storeName', 'storeSlug', 'productName', 'audience', 'oneLine', 'benefits', 'fulfillment', 'contact'];
    const current = values();
    const completed = required.filter((key) => current[key]).length;
    const percent = Math.round((completed / required.length) * 100);
    if (readiness) readiness.style.width = `${percent}%`;
    if (readinessText) readinessText.textContent = `${percent}% · ${completed}/${required.length} 핵심 항목 입력`;
  }

  function downloadDraft() {
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

  fields.forEach((field) => field.addEventListener('input', () => {
    localStorage.setItem(KEY, JSON.stringify(values()));
    if (status) status.textContent = '입력 중 · 자동 임시저장';
    render();
  }));

  document.querySelector('[data-studio-save]')?.addEventListener('click', () => save('초안을 저장했습니다.'));
  document.querySelector('[data-studio-export]')?.addEventListener('click', downloadDraft);
  document.querySelector('[data-studio-copy]')?.addEventListener('click', (event) => copyJson(event.currentTarget));
  document.querySelector('[data-studio-clear]')?.addEventListener('click', () => {
    if (!window.confirm('이 브라우저의 상품 초안을 지울까요?')) return;
    localStorage.removeItem(KEY);
    form.reset();
    if (status) status.textContent = '새 초안을 시작합니다.';
    render();
  });

  restore();
  render();
})();
