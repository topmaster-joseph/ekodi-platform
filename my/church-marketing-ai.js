(() => {
  const MARKETING_URL = 'https://ekodi.kr/ekodichurch/marketing/';
  const AUTH_URL = 'https://auth.ekodi.kr/';
  const host = document.querySelector('#platformList');
  const workspaces = document.querySelector('#workspaceList');
  if (!host || !workspaces) return;

  function selectedChurchWorkspace() {
    const selected = workspaces.querySelector('[data-workspace-key].selected');
    if (!selected) return null;
    const text = String(selected.textContent || '').toLowerCase();
    if (!text.includes('church') && !text.includes('교회')) return null;
    return selected.dataset.workspaceKey || '';
  }

  function entryUrl(workspaceKey) {
    const url = new URL(AUTH_URL);
    url.searchParams.set('site', 'marketing');
    url.searchParams.set('return_to', MARKETING_URL);
    if (workspaceKey) url.searchParams.set('workspace', workspaceKey);
    return url.href;
  }

  function render() {
    const key = selectedChurchWorkspace();
    const existing = host.querySelector('[data-church-marketing-ai-entry]');
    if (!key) {
      existing?.remove();
      return;
    }
    const card = existing || document.createElement('article');
    card.className = 'platform-card';
    card.dataset.churchMarketingAiEntry = 'true';
    card.innerHTML = '<div class="platform-head"><h3>에코디 마케팅AI</h3><span class="plan">교회 공간</span></div>' +
      '<p>현재 선택한 에코디교회 공간의 자료로 홍보문구, 쇼츠 기획, 캠페인, 승인과 게시 준비를 이어갑니다.</p>' +
      '<div class="meta"><span>콘텐츠</span><span>영상</span><span>승인</span><span>퍼블리싱</span></div>' +
      '<a class="card-link" data-church-marketing-link>교회 마케팅AI 열기 →</a>';
    const link = card.querySelector('[data-church-marketing-link]');
    link.href = entryUrl(key);
    if (!existing) host.prepend(card);
  }

  const observer = new MutationObserver(render);
  observer.observe(workspaces, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  observer.observe(host, { childList: true, subtree: true });
  document.addEventListener('click', event => {
    if (event.target.closest('[data-workspace-key]')) setTimeout(render, 0);
  });
  render();
})();
