(() => {
  const API = 'https://api.ekodi.kr';
  const ACCOUNT = 'coupang-ekodibiz';
  const token = () => sessionStorage.getItem('ekodi-auth-token') || '';
  const api = async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    if (options.body) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `요청 실패 (${response.status})`);
    return data;
  };

  function keepMarketingReview() {
    const section = document.querySelector('#clientAccessSection');
    if (!section || section.dataset.marketingFunnelReady === 'true') return false;
    section.dataset.marketingFunnelReady = 'true';
    const head = section.querySelector('.client-access-head');
    if (head) {
      const link = document.createElement('a');
      link.className = 'secondary compact';
      link.href = 'https://auth.ekodi.kr/?site=marketing&review=1&return_to=https%3A%2F%2Fmarketing.ekodi.kr%2F';
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Marketing AI Pro 신청 검수 ↗';
      head.append(link);
    }
    return true;
  }

  function installAffiliate() {
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content || document.querySelector('#affiliatePanel')) return false;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav';
    button.dataset.section = 'affiliates';
    const label = document.createElement('span');
    label.textContent = '↗ Affiliates';
    button.append(label);
    const policies = nav.querySelector('[data-section="policies"]');
    if (policies) nav.insertBefore(button, policies); else nav.append(button);

    const panel = document.createElement('section');
    panel.id = 'affiliatePanel';
    panel.className = 'section hidden-panel';
    panel.dataset.panel = 'affiliates';
    panel.innerHTML = `<div class="section-head"><div><p class="kicker">AFFILIATE OPERATIONS</p><h2>Coupang Partners · EKODIBIZ</h2><p>제휴링크·캠페인·성과를 중앙 관리합니다.</p></div></div><div class="cards"><article class="module"><div class="icon">CP</div><div><strong>30일 성과</strong><p id="affiliateSummary">불러오는 중</p></div></article><article class="module"><div class="icon">↗</div><div><strong>제휴링크 등록</strong><p>상품명, 채널, 캠페인과 함께 등록합니다.</p><form id="affiliateLinkForm"><input name="productName" placeholder="상품/콘텐츠 이름" required> <input name="affiliateUrl" type="url" placeholder="https://..." required> <input name="channel" placeholder="채널"> <input name="campaignName" placeholder="캠페인"> <button class="primary" type="submit">등록</button></form></div></article><article class="module"><div class="icon">₩</div><div><strong>일별 성과</strong><p>클릭·주문·수익을 날짜별로 기록합니다.</p><form id="affiliateMetricForm"><input name="metricDate" type="date" required> <input name="clicks" type="number" min="0" value="0" required> <input name="orders" type="number" min="0" value="0" required> <input name="revenueKrw" type="number" min="0" value="0" required> <button class="primary" type="submit">저장</button></form></div></article></div><p id="affiliateMessage"></p>`;
    content.append(panel);

    const show = async () => {
      document.querySelectorAll('[data-panel]').forEach(item => item.classList.toggle('hidden-panel', !String(item.dataset.panel || '').split(' ').includes('affiliates')));
      document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === 'affiliates'));
      const title = document.querySelector('#pageTitle'); if (title) title.textContent = 'Affiliates';
      history.replaceState(null, '', '#affiliates');
      try {
        const data = await api('/api/affiliate/overview');
        const s = data.summary;
        document.querySelector('#affiliateSummary').textContent = `링크 ${s.activeLinks} · 클릭 ${s.clicks30d} · 주문 ${s.orders30d} · 수익 ${Number(s.revenue30dKrw || 0).toLocaleString('ko-KR')}원`;
      } catch (error) { document.querySelector('#affiliateMessage').textContent = error.message; }
    };
    button.addEventListener('click', show);
    document.querySelector('#affiliateLinkForm')?.addEventListener('submit', async event => {
      event.preventDefault(); const form = event.currentTarget;
      try { await api('/api/affiliate/links', { method: 'POST', body: JSON.stringify({ accountId: ACCOUNT, productName: form.elements.productName.value, affiliateUrl: form.elements.affiliateUrl.value, channel: form.elements.channel.value, campaignName: form.elements.campaignName.value }) }); form.reset(); document.querySelector('#affiliateMessage').textContent = '제휴링크를 등록했습니다.'; await show(); } catch (error) { document.querySelector('#affiliateMessage').textContent = error.message; }
    });
    document.querySelector('#affiliateMetricForm')?.addEventListener('submit', async event => {
      event.preventDefault(); const form = event.currentTarget;
      try { await api('/api/affiliate/metrics', { method: 'POST', body: JSON.stringify({ accountId: ACCOUNT, metricDate: form.elements.metricDate.value, clicks: form.elements.clicks.value, orders: form.elements.orders.value, revenueKrw: form.elements.revenueKrw.value }) }); document.querySelector('#affiliateMessage').textContent = '성과를 저장했습니다.'; await show(); } catch (error) { document.querySelector('#affiliateMessage').textContent = error.message; }
    });
    const date = document.querySelector('#affiliateMetricForm [name="metricDate"]');
    if (date) date.value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
    if (location.hash === '#affiliates') setTimeout(show, 0);
    return true;
  }

  const run = () => { keepMarketingReview(); installAffiliate(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
