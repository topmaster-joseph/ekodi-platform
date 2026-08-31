(() => {
  'use strict';
  const endpoint = 'https://renzehysxirjilvdxacv.supabase.co/rest/v1/mall_sales_events';
  const apikey = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const params = new URLSearchParams(location.search);
  const campaign = String(params.get('utm_campaign') || '').slice(0, 160);
  const source = String(params.get('utm_source') || '').slice(0, 80);
  const medium = String(params.get('utm_medium') || '').slice(0, 80);
  const content = String(params.get('utm_content') || '').slice(0, 160);
  const test = params.get('ekodi_test') === '1' || campaign.startsWith('test_');
  const base = { campaign, source, medium, content, landing_path: '/mall', test };

  function send(event_type, extra = {}) {
    const body = JSON.stringify({ ...base, event_type, ...extra });
    fetch(endpoint, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      keepalive: true,
      headers: { apikey, 'content-type': 'application/json', prefer: 'return=minimal' },
      body,
    }).catch(() => {});
  }

  try {
    const key = `ekodi-mall-visit:${campaign}:${source}:${medium}:${location.pathname}`;
    if (sessionStorage.getItem(key) !== '1') {
      sessionStorage.setItem(key, '1');
      let referrerHost = '';
      try { referrerHost = document.referrer ? new URL(document.referrer).hostname : ''; } catch {}
      send('mall_visit', { metadata: { referrer_host: referrerHost } });
    }
  } catch {
    send('mall_visit');
  }

  document.addEventListener('click', event => {
    const detail = event.target.closest('.product-media-trigger,.detail-button');
    if (detail) {
      const card = detail.closest('.product-card');
      send('product_view', {
        metadata: { product_name: String(card?.querySelector('h3')?.textContent || '').slice(0, 240) },
      });
      return;
    }

    const buy = event.target.closest('#productDialogBuy');
    if (!buy) return;
    let target_host = '';
    try { target_host = new URL(buy.href).hostname; } catch {}
    send('affiliate_click', {
      target_host,
      metadata: { product_name: String(document.querySelector('#productDialogTitle')?.textContent || '').slice(0, 240) },
    });
  }, true);
})();
