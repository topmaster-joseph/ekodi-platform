const link=(label,href)=>Object.freeze({label,href});

export const EKODI_USER_FOOTER=Object.freeze({
  version:2,
  brand:'EKODI',
  operator:Object.freeze({
    label:'운영주체',
    name:'에코디비즈',
    representativeLabel:'대표',
    representative:'정찬균',
    registrationLabel:'사업자등록번호',
    businessRegistrationNumber:'213-13-01959',
  }),
  contact:Object.freeze({
    addressLabel:'사업장 소재지',
    address:'전남광주통합특별시 무안군 청계면 백련동1길 17-4, 건물 1층',
    email:'ekodibiz@gmail.com',
    emailHref:'mailto:ekodibiz@gmail.com',
  }),
  legalLinks:Object.freeze([
    link('개인정보처리방침','https://ekodi.kr/privacy'),
    link('이용약관','https://ekodi.kr/terms'),
    link('문의','mailto:ekodibiz@gmail.com'),
  ]),
  copyright:'© 2026 EKODI · EKODIBIZ. All rights reserved.',
  precedenceNotice:'독립 운영주체 또는 개별 서비스에 별도 정책이 표시된 경우 해당 정책이 우선 적용됩니다.',
  ariaLabel:'EKODI 운영 및 법적 고지',
});

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function renderEkodiUserFooter(config=EKODI_USER_FOOTER){
  const operator=config.operator||{};
  const contact=config.contact||{};
  const links=(config.legalLinks||[]).map(item=>`<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`).join('');
  return `<footer class="ekodi-user-ui-footer" data-ekodi-user-footer="v${Number(config.version)||1}" data-ekodi-legal-footer="user-shell-v2" aria-label="${escapeHtml(config.ariaLabel||'EKODI 운영 및 법적 고지')}"><div class="ekodi-user-ui-footer__inner"><div class="ekodi-user-ui-footer__copy"><strong class="ekodi-user-ui-footer__brand">${escapeHtml(config.brand)}</strong><div class="ekodi-user-ui-footer__business"><span>${escapeHtml(operator.label)} ${escapeHtml(operator.name)}</span><span>${escapeHtml(operator.representativeLabel)} ${escapeHtml(operator.representative)}</span><span>${escapeHtml(operator.registrationLabel)} ${escapeHtml(operator.businessRegistrationNumber)}</span></div><div class="ekodi-user-ui-footer__address"><span>${escapeHtml(contact.addressLabel)} ${escapeHtml(contact.address)}</span><span class="ekodi-user-ui-footer__separator" aria-hidden="true">·</span><a href="${escapeHtml(contact.emailHref)}">${escapeHtml(contact.email)}</a></div><div class="ekodi-user-ui-footer__copyright">${escapeHtml(config.copyright)}</div><div class="ekodi-user-ui-footer__scope">${escapeHtml(config.precedenceNotice)}</div></div><nav class="ekodi-user-ui-footer__links" aria-label="법적 고지">${links}</nav></div></footer>`;
}
