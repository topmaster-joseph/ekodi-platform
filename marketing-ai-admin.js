(() => {
  const API = 'https://api.ekodi.kr';
  const LIVE = 'https://marketing.ekodi.kr/';
  const token = () => sessionStorage.getItem('ekodi-auth-token') || '';

  const api = async path => {
    const headers = new Headers();
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    const response = await fetch(`${API}${path}`, { headers, cache: 'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `MarketingAI 관리자 API 요청 실패 (${response.status})`);
    return data;
  };

  const won = value => `${Number(value || 0).toLocaleString('ko-KR')}원`;
  const dateText = value => {
    if (!value) return '—';
    try { return new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return '—'; }
  };

  function planLabel(row) {
    const plan = String(row?.plan_id || 'free').toUpperCase();
    const status = String(row?.status || 'free').toUpperCase();
    return `${plan} · ${status}`;
  }

  function install() {
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content) return false;

    let button = nav.querySelector('[data-section="marketing-ai"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav';
      button.dataset.section = 'marketing-ai';
      button.append(document.createTextNode('AI '));
      const span = document.createElement('span');
      span.textContent = 'MarketingAI';
      button.append(span);
      const services = nav.querySelector('[data-section="services"]');
      if (services) services.insertAdjacentElement('afterend', button);
      else nav.prepend(button);
    }

    let panel = document.querySelector('#marketingAiAdminPanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'marketingAiAdminPanel';
      panel.className = 'section marketing-ai-admin-panel hidden-panel';
      panel.dataset.panel = 'marketing-ai';
      panel.innerHTML = `
        <div class="marketing-ai-admin-toolbar">
          <div class="marketing-ai-admin-toolbar-copy">
            <p class="kicker">MARKETING AI · ADMIN</p>
            <h2>marketing.ekodi.kr</h2>
            <p>왼쪽은 운영상태, 오른쪽은 실제 Marketing AI 화면입니다. 관리자 토큰은 iframe에 전달하지 않습니다.</p>
          </div>
          <div class="marketing-ai-admin-actions">
            <a class="secondary" href="https://auth.ekodi.kr/?site=marketing&review=1&return_to=https%3A%2F%2Fmarketing.ekodi.kr%2F" target="_blank" rel="noopener">Pro 신청 검수 ↗</a>
            <button type="button" class="secondary" id="marketingAiFrameRefresh">↻ 화면 새로고침</button>
            <a class="primary" href="https://marketing.ekodi.kr/" target="_blank" rel="noopener">새 창 ↗</a>
          </div>
        </div>
        <div class="marketing-ai-admin-status" aria-label="MarketingAI 운영 상태">
          <article><small>Active Paid</small><strong id="marketingAiPaid">—</strong><span>Plus · Pro · Auto</span></article>
          <article><small>Monthly Revenue</small><strong id="marketingAiMrr">—</strong><span>활성 월 구독 합계</span></article>
          <article><small>30D Charges</small><strong id="marketingAiCharges">—</strong><span id="marketingAiChargeCount">결제 확인 중</span></article>
          <article><small>Plan Mix</small><strong id="marketingAiPlanMix">—</strong><span>점포별 구독 현황</span></article>
        </div>
        <div class="marketing-ai-admin-body">
          <aside class="marketing-ai-admin-rail">
            <div class="marketing-ai-admin-rail-head"><strong>최근 MarketingAI 구독</strong><button class="secondary" id="marketingAiDataRefresh" type="button">↻</button></div>
            <p class="marketing-ai-admin-message" id="marketingAiAdminMessage">관리 데이터를 불러오는 중입니다.</p>
            <div class="marketing-ai-plan-list" id="marketingAiPlanList"><div class="marketing-ai-plan-empty">구독 정보를 확인하고 있습니다.</div></div>
          </aside>
          <div class="marketing-ai-frame-shell">
            <div class="marketing-ai-frame-bar"><span class="marketing-ai-frame-dot"></span><span class="marketing-ai-frame-dot"></span><span class="marketing-ai-frame-dot"></span><strong class="marketing-ai-frame-address">https://marketing.ekodi.kr/</strong><small class="marketing-ai-frame-state" id="marketingAiFrameState">READY</small></div>
            <iframe class="marketing-ai-admin-frame" id="marketingAiAdminFrame" title="marketing.ekodi.kr 관리자 우측 화면" loading="lazy" referrerpolicy="no-referrer"></iframe>
            <div class="marketing-ai-admin-foot"><span>관리자 인증정보는 admin.ekodi.kr에만 유지됩니다.</span><a href="https://marketing.ekodi.kr/" target="_blank" rel="noopener">운영 사이트 직접 열기 ↗</a></div>
          </div>
        </div>`;
      content.prepend(panel);
    }

    const message = panel.querySelector('#marketingAiAdminMessage');
    const list = panel.querySelector('#marketingAiPlanList');
    const frame = panel.querySelector('#marketingAiAdminFrame');
    const frameState = panel.querySelector('#marketingAiFrameState');
    let frameLoaded = false;

    function setMessage(text, error = false) {
      message.textContent = text || '';
      message.classList.toggle('error', Boolean(error));
    }

    function renderSubscriptions(rows = []) {
      const marketing = rows.filter(row => String(row.site || '').toLowerCase() === 'marketing');
      const activePaid = marketing.filter(row => String(row.status).toLowerCase() === 'active' && Number(row.monthly_fee || 0) > 0);
      const mrr = activePaid.reduce((sum, row) => sum + Number(row.monthly_fee || 0), 0);
      const counts = marketing.reduce((acc, row) => {
        const plan = String(row.plan_id || 'free').toLowerCase();
        acc[plan] = (acc[plan] || 0) + 1;
        return acc;
      }, {});
      document.querySelector('#marketingAiPaid').textContent = activePaid.length.toLocaleString('ko-KR');
      document.querySelector('#marketingAiMrr').textContent = won(mrr);
      document.querySelector('#marketingAiPlanMix').textContent = `P${counts.plus || 0} · R${counts.pro || 0} · A${counts.auto || 0}`;

      const recent = [...marketing].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))).slice(0, 12);
      list.replaceChildren();
      if (!recent.length) {
        const empty = document.createElement('div');
        empty.className = 'marketing-ai-plan-empty';
        empty.textContent = '아직 저장된 MarketingAI 구독이 없습니다.';
        list.append(empty);
        return;
      }
      for (const row of recent) {
        const item = document.createElement('article');
        item.className = 'marketing-ai-plan-item';
        const head = document.createElement('div');
        head.className = 'marketing-ai-plan-item-head';
        const subject = document.createElement('strong');
        subject.textContent = `${row.subject_type || 'account'} · ${row.subject_key || '—'}`;
        subject.title = row.subject_key || '';
        const chip = document.createElement('span');
        chip.className = 'marketing-ai-plan-chip';
        chip.textContent = planLabel(row);
        head.append(subject, chip);
        const meta = document.createElement('small');
        meta.textContent = `${Number(row.monthly_fee || 0) > 0 ? `월 ${won(row.monthly_fee)}` : '무료/혜택'} · ${dateText(row.updated_at)}`;
        item.append(head, meta);
        list.append(item);
      }
    }

    function renderCharges(rows = []) {
      const now = Date.now();
      const start = now - 30 * 24 * 60 * 60 * 1000;
      const marketing = rows.filter(row => String(row.site || '').toLowerCase() === 'marketing' && String(row.status || '').toLowerCase() === 'done');
      const recent = marketing.filter(row => {
        const ts = Date.parse(row.completed_at || row.created_at || '');
        return Number.isFinite(ts) && ts >= start;
      });
      const total = recent.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      document.querySelector('#marketingAiCharges').textContent = won(total);
      document.querySelector('#marketingAiChargeCount').textContent = `최근 30일 ${recent.length.toLocaleString('ko-KR')}건`;
    }

    async function refreshData() {
      if (!token()) return;
      setMessage('MarketingAI 구독·결제 상태를 불러오는 중입니다.');
      try {
        const [subscriptions, charges] = await Promise.all([
          api('/api/membership/admin/subscriptions'),
          api('/api/membership/admin/charges'),
        ]);
        renderSubscriptions(subscriptions.subscriptions || []);
        renderCharges(charges.charges || []);
        setMessage(`마지막 확인 ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`);
      } catch (error) {
        setMessage(error.message || 'MarketingAI 관리 데이터를 불러오지 못했습니다.', true);
      }
    }

    function ensureFrame() {
      if (frameLoaded) return;
      frameLoaded = true;
      frameState.textContent = 'LOADING';
      frame.src = LIVE;
      frame.addEventListener('load', () => { frameState.textContent = 'LIVE'; }, { once: true });
    }

    function show() {
      document.querySelectorAll('[data-panel]').forEach(item => {
        const targets = String(item.dataset.panel || '').split(' ');
        item.classList.toggle('hidden-panel', !targets.includes('marketing-ai'));
      });
      document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === 'marketing-ai'));
      const title = document.querySelector('#pageTitle');
      if (title) title.textContent = 'MarketingAI';
      document.querySelector('.sidebar')?.classList.remove('open');
      if (location.hash !== '#marketing-ai') history.replaceState(null, '', '#marketing-ai');
      ensureFrame();
      refreshData();
    }

    button.addEventListener('click', show);
    panel.querySelector('#marketingAiDataRefresh')?.addEventListener('click', refreshData);
    panel.querySelector('#marketingAiFrameRefresh')?.addEventListener('click', () => {
      frameState.textContent = 'RELOADING';
      frame.src = LIVE;
      frame.addEventListener('load', () => { frameState.textContent = 'LIVE'; }, { once: true });
    });

    if (location.hash === '#marketing-ai' && token()) setTimeout(show, 0);
    const app = document.querySelector('#app');
    if (app?.hidden) {
      const observer = new MutationObserver(() => {
        if (!app.hidden && token()) {
          observer.disconnect();
          if (location.hash === '#marketing-ai') show();
        }
      });
      observer.observe(app, { attributes: true, attributeFilter: ['hidden'] });
    }
    return true;
  }

  const run = () => install();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
