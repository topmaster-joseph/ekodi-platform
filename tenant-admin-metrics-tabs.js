// ADMIN-TAB-VIEW-20261102: Shared, presentation-only tenant admin view.
// Authentication, permissions and the existing section router remain authoritative.
export function tenantAdminMetricsTabsMarkupFor(metricsId = 'summaryCards', workId = 'mainPanel') {
  return '<nav class="admin-view-tabs" data-ekodi-admin-view-tabs role="tablist" aria-label="관리자 화면 보기">' +
    '<button type="button" id="adminWorkTab" role="tab" data-admin-view="work" aria-controls="' + workId + '" aria-selected="true">업무</button>' +
    '<button type="button" id="adminMetricsTab" role="tab" data-admin-view="metrics" aria-controls="' + metricsId + '" aria-selected="false" tabindex="-1">운영 지표</button>' +
    '</nav>';
}
export const tenantAdminMetricsTabsMarkup = tenantAdminMetricsTabsMarkupFor();

export const tenantAdminMetricsTabsCss = `
.admin-view-tabs{display:flex;align-items:center;gap:6px;min-height:42px;margin:0 0 10px;padding:0 0 8px;border-bottom:1px solid #dfe5ec;overflow-x:auto;max-width:100%;scrollbar-width:thin}
.admin-view-tabs button{flex:0 0 auto;min-height:38px;padding:7px 15px;border:1px solid #d6e0ea;border-radius:9px;background:#fff;color:#475569;font:inherit;font-size:13px;font-weight:700;cursor:pointer;word-break:keep-all}
.admin-view-tabs button:hover{background:#f1f6ff;border-color:#a5bee0}
.admin-view-tabs button.active,.admin-view-tabs button[aria-selected="true"]{border-color:#9bbce5;background:#eaf3ff;color:#0b4fb3;font-weight:850}
.admin-view-tabs button:focus-visible{outline:2px solid #155eef;outline-offset:2px}
.layout main > #summaryCards[hidden],.layout main > #mainPanel[hidden]{display:none!important}
.layout main > #summaryCards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr));gap:10px}
.layout main > #summaryCards .card{padding:12px;box-shadow:none}
.layout main > .heading .state,.layout main > .heading-actions .state{display:none!important}
.layout main > .heading{margin-bottom:10px}
@media(max-width:700px){.admin-view-tabs button{min-height:44px;padding:9px 12px}.layout main > #summaryCards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:360px){.layout main > #summaryCards{grid-template-columns:1fr}}
`;

export function mountTenantAdminMetricsTabs(metricsId = 'summaryCards', workId = 'mainPanel') {
  const nav = document.querySelector('[data-ekodi-admin-view-tabs]');
  const metrics = document.getElementById(metricsId);
  const work = document.getElementById(workId);
  if (!nav || !metrics || !work || nav.dataset.boundMetricsTabs === 'true') return;
  nav.dataset.boundMetricsTabs = 'true';
  const tabs = [...nav.querySelectorAll('[data-admin-view]')];
  const fromUrl = () => new URL(location.href).searchParams.get('adminView') === 'metrics' ? 'metrics' : 'work';
  const show = (view, writeUrl = false) => {
    const target = view === 'metrics' ? 'metrics' : 'work';
    metrics.hidden = target !== 'metrics';
    work.hidden = target !== 'work';
    for (const tab of tabs) {
      const active = tab.dataset.adminView === target;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    if (writeUrl) {
      const url = new URL(location.href);
      if (target === 'metrics') url.searchParams.set('adminView', 'metrics');
      else url.searchParams.delete('adminView');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    }
  };
  for (const tab of tabs) tab.addEventListener('click', () => show(tab.dataset.adminView, true));
  nav.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const current = tabs.indexOf(document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    tabs[next].click();
  });
  window.addEventListener('popstate', () => show(fromUrl()));
  show(fromUrl());
}
