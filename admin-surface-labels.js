(() => {
  'use strict';
  const canonical = Object.freeze({
    'admin.ekodi.kr': ['ekodi.kr/admin', 'https://ekodi.kr/admin/'],
    'auth.ekodi.kr': ['ekodi.kr/auth', 'https://ekodi.kr/auth/'],
    'my.ekodi.kr': ['ekodi.kr/my', 'https://ekodi.kr/my/'],
    'church.ekodi.kr': ['ekodi.kr/ekodichurch', 'https://ekodi.kr/ekodichurch'],
    'biz.ekodi.kr': ['ekodi.kr/ekodibiz', 'https://ekodi.kr/ekodibiz'],
    'lab.ekodi.kr': ['ekodi.kr/ekodilab', 'https://ekodi.kr/ekodilab'],
    'trade.ekodi.kr': ['ekodi.kr/ekodibiz/trade', 'https://ekodi.kr/ekodibiz/trade'],
    'mall.ekodi.kr': ['ekodi.kr/ekodibiz/mall', 'https://ekodi.kr/ekodibiz/mall'],
    'business.ekodi.kr': ['ekodi.kr/business', 'https://ekodi.kr/business'],
    'cgma.ekodi.kr': ['ekodi.kr/cgma · cgma.or.kr', 'https://ekodi.kr/cgma'],
    'jadam.ekodi.kr': ['ekodi.kr/jadam', 'https://ekodi.kr/jadam'],
    'pizzamaru.ekodi.kr': ['ekodi.kr/pizzamaru', 'https://ekodi.kr/pizzamaru'],
    'yogurt.ekodi.kr': ['ekodi.kr/yogurt', 'https://ekodi.kr/yogurt'],
  });
  function hostOf(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try { return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase(); }
    catch { return raw.replace(/^https?:\/\//i, '').split(/[/?#]/)[0].toLowerCase(); }
  }
  function info(value, explicitLabel = '', explicitUrl = '') {
    const host = hostOf(value);
    const mapped = canonical[host];
    if (mapped) return Object.freeze({ host, label: explicitLabel || mapped[0], url: explicitUrl || mapped[1], kind: 'canonical' });
    const raw = String(value || '').trim();
    if (host.endsWith('.ekodi.kr')) {
      return Object.freeze({
        host,
        label: explicitLabel || '에코디 내부 서비스 실행 경계',
        url: explicitUrl || (/^https?:\/\//i.test(raw) ? raw : `https://${host}`),
        kind: 'runtime',
      });
    }
    return Object.freeze({
      host,
      label: explicitLabel || raw || '주소 미정',
      url: explicitUrl || (/^https?:\/\//i.test(raw) ? raw : (raw ? `https://${raw}` : '')),
      kind: 'external',
    });
  }
  function label(value, explicitLabel = '') { return info(value, explicitLabel).label; }
  function url(value, explicitUrl = '') { return info(value, '', explicitUrl).url; }
  window.EKODIAdminSurfaceLabels = Object.freeze({ version: '1.0.0', canonical, info, label, url });
})();
