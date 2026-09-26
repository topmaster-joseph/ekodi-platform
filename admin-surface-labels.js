(() => {
  'use strict';
  const canonical = Object.freeze({
    'ekodi.kr/admin': ['ekodi.kr/admin', 'https://ekodi.kr/admin/'],
    'ekodi.kr/auth': ['ekodi.kr/auth', 'https://ekodi.kr/auth/'],
    'ekodi.kr/my': ['ekodi.kr/my', 'https://ekodi.kr/my/'],
    'ekodi.kr/ekodichurch': ['ekodi.kr/ekodichurch', 'https://ekodi.kr/ekodichurch'],
    'ekodi.kr/ekodibiz': ['ekodi.kr/ekodibiz', 'https://ekodi.kr/ekodibiz'],
    'ekodi.kr/ekodilab': ['ekodi.kr/ekodilab', 'https://ekodi.kr/ekodilab'],
    'ekodi.kr/ekodibiz/trade': ['ekodi.kr/ekodibiz/trade', 'https://ekodi.kr/ekodibiz/trade'],
    'ekodi.kr/ekodimall': ['ekodi.kr/ekodimall', 'https://ekodi.kr/ekodimall'],
    'ekodi.kr/business': ['ekodi.kr/business', 'https://ekodi.kr/business'],
    'ekodi.kr/cgma': ['ekodi.kr/cgma · cgma.or.kr', 'https://ekodi.kr/cgma'],
    'ekodi.kr/jadam': ['ekodi.kr/jadam', 'https://ekodi.kr/jadam'],
    'ekodi.kr/pizzamaru': ['ekodi.kr/pizzamaru', 'https://ekodi.kr/pizzamaru'],
    'ekodi.kr/yogurt': ['ekodi.kr/yogurt', 'https://ekodi.kr/yogurt'],
  });
  function surfaceKey(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      const path = url.pathname.replace(/\/+$/, '') || '';
      return `${url.hostname.toLowerCase()}${path}`;
    } catch {
      return raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
    }
  }
  function info(value, explicitLabel = '', explicitUrl = '') {
    const key = surfaceKey(value);
    const mapped = canonical[key];
    if (mapped) return Object.freeze({ host:'ekodi.kr', key, label:explicitLabel||mapped[0], url:explicitUrl||mapped[1], kind:'canonical' });
    const raw = String(value || '').trim();
    try {
      const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (parsed.hostname === 'ekodi.kr') {
        return Object.freeze({ host:'ekodi.kr', key, label:explicitLabel||key, url:explicitUrl||parsed.href, kind:'canonical' });
      }
      return Object.freeze({ host:parsed.hostname.toLowerCase(), key, label:explicitLabel||raw||'주소 미정', url:explicitUrl||parsed.href, kind:'external' });
    } catch {
      return Object.freeze({ host:'', key, label:explicitLabel||raw||'주소 미정', url:explicitUrl||'', kind:'external' });
    }
  }
  function label(value, explicitLabel = '') { return info(value, explicitLabel).label; }
  function url(value, explicitUrl = '') { return info(value, '', explicitUrl).url; }
  window.EKODIAdminSurfaceLabels = Object.freeze({ version: '1.0.0', canonical, info, label, url });
})();
