(() => {
  const hostSection = document.querySelector('#recommendations');
  if (!hostSection || document.querySelector('#revenueOpportunityShell')) return;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/my/revenue-opportunity.css?v=20260911-revenue-engine-1';
  document.head.append(css);

  const ideaLibrary = [
    {
      id: 'digital-knowledge-product',
      title: '지식·경험 디지털 상품',
      signals: ['글','강의','교육','연구','자료','지식','콘텐츠'],
      summary: '이미 가진 지식과 자료를 작게 상품화하고 실제 지불의향부터 확인합니다.'
    },
    {
      id: 'managed-content-service',
      title: 'AI 콘텐츠 운영 서비스',
      signals: ['사업','가게','매장','홍보','마케팅','sns','유튜브','쇼츠'],
      summary: '생산·게시·분석을 반복 서비스로 묶어 작은 고객군에서 먼저 검증합니다.'
    },
    {
      id: 'vertical-micro-saas',
      title: '업종 특화 작은 SaaS',
      signals: ['반복','관리','자동화','고객','예약','회원','업무'],
      summary: '반복되는 한 가지 업무를 재고 없는 구독형 기능으로 먼저 해결합니다.'
    },
    {
      id: 'local-demand-connector',
      title: '지역 수요 연결 서비스',
      signals: ['지역','상인','상권','관광','예약','연결','소개'],
      summary: '재고를 직접 보유하지 않고 지역의 수요와 공급을 연결하는 모델을 검증합니다.'
    }
  ];
  const capabilities = [
    ['\uC218\uC775\uAE30\uD68C \uC815\uBCF4','info'],['\uC0AC\uC5C5\uC131 \uBE44\uAD50\u00B7\uC124\uBA85','info'],['\uACF5\uACF5\uC9C0\uC6D0 \uC548\uB0B4','info'],
    ['\uCC44\uB110\uBCC4 \uC815\uBCF4 \uC81C\uACF5','info'],['EKODIBIZ \uAD00\uB9AC\uD615 \uC11C\uBE44\uC2A4 \uC758\uB8B0','info']
  ];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
  const currentText = () => String(document.querySelector('#intentPlanText')?.value || '').trim().toLowerCase();

  const shell = document.createElement('div');
  shell.id = 'revenueOpportunityShell';
  shell.className = 'revenue-opportunity-shell';
  shell.innerHTML = '<div class="revenue-opportunity-head"><div><small class="eyebrow">EKODI REVENUE ENGINE &middot; INFORMATION</small><h3>\uB098\uC5D0\uAC8C \uB9DE\uB294 \uC218\uC775\uC815\uBCF4\uC640 \uAE30\uD68C</h3><p>\uC77C\uBC18 \uC0AC\uC6A9\uC790\uC5D0\uAC8C\uB294 \uD0D0\uC0C9&middot;\uCD94\uCC9C&middot;\uBE44\uAD50&middot;\uC548\uB0B4 \uC911\uC2EC\uC73C\uB85C \uC81C\uACF5\uD569\uB2C8\uB2E4. EKODI \uD50C\uB7AB\uD3FC\uC758 \uC218\uC775\uC0AC\uC5C5 \uC6B4\uC601&middot;\uACC4\uC57D&middot;\uC218\uB0A9\uC740 EKODIBIZ\uAC00 \uB2F4\uB2F9\uD569\uB2C8\uB2E4.</p></div><span class="revenue-opportunity-badge">\uC815\uBCF4 \uC81C\uACF5</span></div><div class="revenue-idea-grid" data-revenue-ideas></div><div class="revenue-capability-panel"><div><div><h4>\uD544\uC694\uD55C \uC815\uBCF4\uC640 \uC11C\uBE44\uC2A4</h4><p>\uD604\uC7AC \uC0C1\uD669\uC5D0 \uB9DE\uB294 \uC815\uBCF4\uB97C \uBA3C\uC800 \uC81C\uACF5\uD558\uACE0, \uC2E4\uC81C \uC0C1\uC5C5 \uC11C\uBE44\uC2A4\uAC00 \uD544\uC694\uD55C \uACBD\uC6B0 EKODIBIZ\uB85C \uC5F0\uACB0\uD569\uB2C8\uB2E4.</p></div></div><div class="revenue-capability-list" data-revenue-capabilities></div></div><p class="revenue-recommendation-note" data-revenue-note>\uC81C\uC548\uC740 \uC815\uBCF4\uC640 \uAC00\uB2A5\uC131 \uC548\uB0B4\uC785\uB2C8\uB2E4. EKODI \uB0B4 \uC218\uC775\uC0AC\uC5C5\uC758 \uC218\uC775\uC18C\uC720&middot;\uC6B4\uC601&middot;\uACC4\uC57D&middot;\uC218\uB0A9 \uC8FC\uCCB4\uB294 EKODIBIZ\uC774\uBA70, \uC77C\uBC18 \uC0AC\uC6A9\uC790\uC758 \uB3C5\uB9BD\uC801\uC778 \uC678\uBD80 \uC0AC\uC5C5 \uAD8C\uD55C\uC740 \uC81C\uD55C\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.</p>';
  hostSection.append(shell);

  const ideasHost = shell.querySelector('[data-revenue-ideas]');
  const capabilityHost = shell.querySelector('[data-revenue-capabilities]');
  capabilityHost.innerHTML = capabilities.map(([label, access]) => `<span class="revenue-capability" data-access="${access}"><span>${esc(label)}</span><b>\uC548\uB0B4</b></span>`).join('');

  function rankIdeas(text) {
    return ideaLibrary.map(idea => ({
      ...idea,
      score: idea.signals.reduce((score, signal) => score + (text.includes(signal) ? 1 : 0), 0)
    })).sort((a,b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0,3);
  }

  function fillIntent(idea) {
    const input = document.querySelector('#intentPlanText');
    if (!input) return;
    input.value = `${idea.title} \uAD00\uB828 \uC815\uBCF4\uC640 \uACF5\uACF5\uC9C0\uC6D0 \uAE30\uD68C\uB97C \uBE44\uAD50\uD574\uC8FC\uACE0, \uD544\uC694\uD558\uBA74 EKODIBIZ \uAD00\uB9AC\uD615 \uC11C\uBE44\uC2A4\uB85C \uC5F0\uACB0\uD574\uC918`;
    input.focus();
    input.scrollIntoView({ behavior:'smooth', block:'center' });
  }

  function render() {
    const text = currentText();
    const ideas = rankIdeas(text);
    ideasHost.innerHTML = ideas.map((idea,index) => `<article class="revenue-idea"><small>${String(index+1).padStart(2,'0')} &middot; \uC815\uBCF4 \uC81C\uC548</small><strong>${esc(idea.title)}</strong><p>${esc(idea.summary)}</p><button type="button" data-revenue-idea="${esc(idea.id)}">\uC815\uBCF4\uB85C \uBCF4\uAE30</button></article>`).join('');
    ideasHost.querySelectorAll('[data-revenue-idea]').forEach(button => button.addEventListener('click', () => {
      const idea = ideaLibrary.find(item => item.id === button.dataset.revenueIdea);
      if (idea) fillIntent(idea);
    }));
  }

  document.querySelector('#intentPlanText')?.addEventListener('input', () => {
    clearTimeout(render.timer);
    render.timer = setTimeout(render, 140);
  });
  window.addEventListener('ekodi:my-session', render);
  render();
})();
