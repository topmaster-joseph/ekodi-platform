(() => {
  const API = 'https://api.ekodi.kr';
  const LIVE = 'https://marketing.ekodi.kr/';
  const REVIEW = 'https://auth.ekodi.kr/?site=marketing&review=1&return_to=https%3A%2F%2Fmarketing.ekodi.kr%2F';
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
    try {
      return new Date(value).toLocaleString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
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
            <div class="marketing-ai-admin-eyebrow"><span>MARKETING AI</span><span class="marketing-ai-admin-mode">ADMIN CONSOLE</span></div>
            <h2>Marketing AI 운영센터</h2>
            <p>사용자 화면과 분리된 관리자 전용 콘솔입니다. 구독, 매출, 플랜과 최근 활동을 한 화면에서 관리합니다.</p>
          </div>
          <div class="marketing-ai-admin-actions">
            <button type="button" class="secondary" data-marketing-refresh>↻ 운영 데이터</button>
            <a class="secondary" href="${REVIEW}" target="_blank" rel="noopener">Pro 신청 검수 ↗</a>
            <a class="primary marketing-ai-user-link" href="${LIVE}" target="_blank" rel="noopener">사용자 페이지 ↗</a>
          </div>
        </div>
        <div class="marketing-ai-admin-status" aria-label="MarketingAI 운영 상태">
          <article>
            <small>유료 구독</small>
            <strong id="marketingAiPaid">—</strong>
            <span>PLUS · PRO · AUTO 활성</span>
          </article>
          <article>
            <small>월 반복매출</small>
            <strong id="marketingAiMrr">—</strong>
            <span>활성 월 구독 합계</span>
          </article>
          <article>
            <small>최근 30일 결제</small>
            <strong id="marketingAiCharges">—</strong>
            <span id="marketingAiChargeCount">결제 확인 중</span>
          </article>
          <article>
            <small>플랜 구성</small>
            <strong id="marketingAiPlanMix">—</strong>
            <span>PLUS · PRO · AUTO</span>
          </article>
        </div>
        <div class="marketing-ai-admin-body">
          <section class="marketing-ai-admin-main" aria-labelledby="marketingAiRecentTitle">
            <div class="marketing-ai-section-head">
              <div>
                <span class="marketing-ai-section-kicker">SUBSCRIPTIONS</span>
                <h3 id="marketingAiRecentTitle">최근 MarketingAI 구독</h3>
              </div>
              <button class="secondary marketing-ai-icon-button" data-marketing-refresh type="button" aria-label="MarketingAI 운영 데이터 새로고침">↻</button>
            </div>
            <p class="marketing-ai-admin-message" id="marketingAiAdminMessage">관리 데이터를 불러오는 중입니다.</p>
            <div class="marketing-ai-plan-list" id="marketingAiPlanList"><div class="marketing-ai-plan-empty">구독 정보를 확인하고 있습니다.</div></div>
          </section>
          <aside class="marketing-ai-admin-side" aria-label="MarketingAI 관리자 요약">
            <section class="marketing-ai-side-card marketing-ai-plan-overview">
              <div class="marketing-ai-side-card-head"><span>PLAN OVERVIEW</span><strong>플랜 현황</strong></div>
              <div class="marketing-ai-plan-count-grid">
                <div><span>FREE</span><strong id="marketingAiFreeCount">—</strong></div>
                <div><span>PLUS</span><strong id="marketingAiPlusCount">—</strong></div>
                <div><span>PRO</span><strong id="marketingAiProCount">—</strong></div>
                <div><span>AUTO</span><strong id="marketingAiAutoCount">—</strong></div>
              </div>
              <p><strong id="marketingAiTotalCount">—</strong>개의 MarketingAI 구독 레코드를 관리 중입니다.</p>
            </section>
            <section class="marketing-ai-side-card marketing-ai-entry-card">
              <div class="marketing-ai-side-card-head"><span>USER ENTRY</span><strong>사용자 페이지</strong></div>
              <a class="marketing-ai-entry-link" href="${LIVE}" target="_blank" rel="noopener">
                <span><small>PUBLIC</small><strong>marketing.ekodi.kr</strong></span><b>↗</b>
              </a>
              <p>사용자 사이트는 관리자 화면 안에 임베드하지 않습니다. 별도 탭 또는 창에서 열리므로 관리자 인증 경계도 더 선명하게 유지됩니다.</p>
            </section>
            <section class="marketing-ai-side-card marketing-ai-boundary-card">
              <div class="marketing-ai-side-card-head"><span>BOUNDARY</span><strong>관리 영역 분리</strong></div>
              <div class="marketing-ai-boundary-row"><span>ADMIN</span><strong>admin.ekodi.kr</strong></div>
              <div class="marketing-ai-boundary-row"><span>USER</span><strong>marketing.ekodi.kr</strong></div>
              <p>관리자는 운영 데이터와 검수에 집중하고, 실제 사용 경험은 사용자 페이지에서 독립적으로 유지합니다.</p>
            </section>
          </aside>
        </div>`;
      content.prepend(panel);
    }

    const message = panel.querySelector('#marketingAiAdminMessage');
    const list = panel.querySelector('#marketingAiPlanList');

    function setMessage(text, error = false) {
      if (!message) return;
      message.textContent = text || '';
      message.classList.toggle('error', Boolean(error));
    }

    function setText(selector, value) {
      const target = panel.querySelector(selector);
      if (target) target.textContent = value;
    }

    function renderSubscriptions(rows = []) {
      const marketing = rows.filter(row => String(row.site || '').toLowerCase() === 'marketing');
      const activePaid = marketing.filter(row => String(row.status || '').toLowerCase() === 'active' && Number(row.monthly_fee || 0) > 0);
      const mrr = activePaid.reduce((sum, row) => sum + Number(row.monthly_fee || 0), 0);
      const counts = marketing.reduce((acc, row) => {
        const plan = String(row.plan_id || 'free').toLowerCase();
        acc[plan] = (acc[plan] || 0) + 1;
        return acc;
      }, {});
      const freeCount = Number(counts.free || 0) + Number(counts.basic || 0);
      const plusCount = Number(counts.plus || 0);
      const proCount = Number(counts.pro || 0);
      const autoCount = Number(counts.auto || 0);

      setText('#marketingAiPaid', activePaid.length.toLocaleString('ko-KR'));
      setText('#marketingAiMrr', won(mrr));
      setText('#marketingAiPlanMix', `PLUS ${plusCount} · PRO ${proCount} · AUTO ${autoCount}`);
      setText('#marketingAiFreeCount', freeCount.toLocaleString('ko-KR'));
      setText('#marketingAiPlusCount', plusCount.toLocaleString('ko-KR'));
      setText('#marketingAiProCount', proCount.toLocaleString('ko-KR'));
      setText('#marketingAiAutoCount', autoCount.toLocaleString('ko-KR'));
      setText('#marketingAiTotalCount', marketing.length.toLocaleString('ko-KR'));

      const recent = [...marketing]
        .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
        .slice(0, 16);
      list?.replaceChildren();
      if (!list) return;
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
      setText('#marketingAiCharges', won(total));
      setText('#marketingAiChargeCount', `최근 30일 ${recent.length.toLocaleString('ko-KR')}건`);
    }

    async function refreshData() {
      if (!token()) {
        setMessage('관리자 로그인 후 운영 데이터를 확인할 수 있습니다.', true);
        return;
      }
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
      refreshData();
    }

    button.addEventListener('click', show);
    panel.querySelectorAll('[data-marketing-refresh]').forEach(refreshButton => refreshButton.addEventListener('click', refreshData));

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
