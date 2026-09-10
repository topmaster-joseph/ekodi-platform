const EKODIBIZ_ADMIN_SCOPE_DEFINITIONS = [
  {
    id: 'common', label: '에코디비즈 공통', shortLabel: '공통',
    description: '에코디비즈 전체 공통 운영·서비스·설정을 관리합니다.',
    adminHref: '/ekodibiz/admin', publicHref: '/ekodibiz', kind: 'workspace',
  },
  {
    id: 'mall', label: '에코디몰', shortLabel: '몰',
    description: '상품·제휴·채널·AI 영업·성과 학습을 관리합니다.',
    adminHref: '/ekodibiz/mall/admin', publicHref: '/ekodibiz/mall', kind: 'module',
  },
  {
    id: 'trade', label: '에코디무역', shortLabel: '무역',
    description: '거래회사·거래 운영·무역 관리자 권한을 관리합니다.',
    adminHref: '/ekodibiz/trade/admin', publicHref: '/ekodibiz/trade', kind: 'module',
  },
  {
    id: 'books', label: '에코디서점', shortLabel: '서점',
    description: '출판물·상담·출판대행·가격·기능 노출을 관리합니다.',
    adminHref: '/admin/services/books?source=ekodibiz', publicHref: '/books', kind: 'service',
  },
  {
    id: 'lab', label: '에코디연구소', shortLabel: '연구소',
    description: '연구소 운영공간과 사이트·서비스·권한을 관리합니다.',
    adminHref: '/ekodi-lab/admin?source=ekodibiz', publicHref: '/ekodilab', kind: 'workspace',
  },
];

export const EKODIBIZ_ADMIN_SCOPES = Object.freeze(
  EKODIBIZ_ADMIN_SCOPE_DEFINITIONS.map(item => Object.freeze({ ...item }))
);

export function ekodiBizAdminScopeSnapshot() {
  return Object.freeze({ version: 1, scopes: EKODIBIZ_ADMIN_SCOPES.map(item => ({ ...item })) });
}

export function ekodiBizAdminScopeForPath(pathname = '') {
  const path = String(pathname || '').replace(/\/+$/, '') || '/';
  if (/^\/ekodibiz\/mall\/admin(?:\/|$)/i.test(path)) return 'mall';
  if (/^\/ekodibiz\/trade\/admin(?:\/|$)/i.test(path)) return 'trade';
  if (/^\/admin\/services\/books(?:\/|$)/i.test(path)) return 'books';
  if (/^\/(?:ekodi-lab|ekodilab)\/admin(?:\/|$)/i.test(path)) return 'lab';
  if (/^\/ekodibiz\/admin(?:\/|$)/i.test(path)) return 'common';
  return '';
}
