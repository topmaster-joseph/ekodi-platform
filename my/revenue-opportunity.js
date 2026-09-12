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
    ['수익기회 탐색','free'],['상품·서비스 만들기','free'],['콘텐츠 생산','free'],
    ['전문 홈페이지 자동 구성','paid'],['채널 게시·배포','paid'],['홍보·유입 자동화','paid'],
    ['고객·재구매 관리','paid'],['성과·수익 분석','free'],['자율 수익 운영','paid']
  ];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
  const currentText = () => String(document.querySelector('#intentPlanText')?.value || '').trim().toLowerCase();

  const shell = document.createElement('div');
  shell.id = 'revenueOpportunityShell';
  shell.className = 'revenue-opportunity-shell';
  shell.innerHTML = '<div class="revenue-opportunity-head"><div><small class="eyebrow">EKODI REVENUE ENGINE · MY ENTRY</small><h3>나에게 맞는 작은 수익기회</h3><p>처음부터 큰 사업을 만들지 않습니다. 내 목표에서 가능한 아이디어를 몇 개만 제안하고, 실제 수요를 작은 범위에서 먼저 검증합니다.</p></div><span class="revenue-opportunity-badge">기본 제안 무료</span></div><div class="revenue-idea-grid" data-revenue-ideas></div><div class="revenue-capability-panel"><div><div><h4>필요한 기능만 확장</h4><p>무료 핵심 경험은 남기고, 자동화 범위는 기능별로 선택합니다.</p></div></div><div class="revenue-capability-list" data-revenue-capabilities></div></div><p class="revenue-recommendation-note" data-revenue-note>제안은 시장 검증 전 아이디어입니다. 결제·계약·광고비·외부계정 연결 같은 중요한 실행은 별도 승인과 권한 확인을 유지합니다.</p>';
  hostSection.append(shell);

  const ideasHost = shell.querySelector('[data-revenue-ideas]');
  const capabilityHost = shell.querySelector('[data-revenue-capabilities]');
  capabilityHost.innerHTML = capabilities.map(([label, access]) => `<span class="revenue-capability" data-access="${access}"><span>${esc(label)}</span><b>${access === 'free' ? '기본' : '구독형'}</b></span>`).join('');

  function rankIdeas(text) {
    return ideaLibrary.map(idea => ({
      ...idea,
      score: idea.signals.reduce((score, signal) => score + (text.includes(signal) ? 1 : 0), 0)
    })).sort((a,b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0,3);
  }

  function fillIntent(idea) {
    const input = document.querySelector('#intentPlanText');
    if (!input) return;
    input.value = `${idea.title} 아이디어를 내 상황에 맞게 작게 검증하고, 필요한 기능과 중단 조건까지 계획해줘`;
    input.focus();
    input.scrollIntoView({ behavior:'smooth', block:'center' });
  }

  function render() {
    const text = currentText();
    const ideas = rankIdeas(text);
    ideasHost.innerHTML = ideas.map((idea,index) => `<article class="revenue-idea"><small>${String(index+1).padStart(2,'0')} · 검증 전 아이디어</small><strong>${esc(idea.title)}</strong><p>${esc(idea.summary)}</p><button type="button" data-revenue-idea="${esc(idea.id)}">작게 검증하기</button></article>`).join('');
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
