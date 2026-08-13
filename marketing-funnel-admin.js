(() => {
  const REVIEW_URL = 'https://auth.ekodi.kr/?site=marketing&review=1&return_to=https%3A%2F%2Fmarketing.ekodi.kr%2F';

  function install() {
    const section = document.querySelector('#clientAccessSection');
    if (!section || section.dataset.marketingFunnelReady === 'true') return false;
    section.dataset.marketingFunnelReady = 'true';

    const head = section.querySelector('.client-access-head');
    if (head) {
      const actions = document.createElement('div');
      actions.className = 'client-funnel-actions';
      const review = document.createElement('a');
      review.className = 'secondary compact';
      review.href = REVIEW_URL;
      review.target = '_blank';
      review.rel = 'noopener';
      review.textContent = 'Marketing AI Pro 신청 검수 ↗';
      actions.append(review);
      const refresh = head.querySelector('#refreshClients');
      if (refresh) actions.append(refresh);
      head.append(actions);
    }

    const summary = section.querySelector('#clientAccessSummary');
    if (summary) {
      const note = document.createElement('div');
      note.className = 'client-funnel-note';
      const strong = document.createElement('strong');
      strong.textContent = 'Marketing AI 신규 고객 흐름';
      const copy = document.createElement('span');
      copy.textContent = '무료체험 → Google 무료회원 → Pro 사용신청 → 관리자 승인 → 고급기능 활성화';
      const sub = document.createElement('small');
      sub.textContent = '기존 고객 초대 기능은 직접 등록이 필요한 예외 상황의 보조 수단으로만 유지합니다.';
      note.append(strong, copy, sub);
      summary.insertAdjacentElement('beforebegin', note);
    }
    return true;
  }

  if (!install()) {
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
  }
})();
