// Shared user footer. Mall local-footer deduplication is handled by ekodi-shell-injector.js.
const link=(label,href,i18n='')=>Object.freeze({label,href,i18n});

export const EKODI_USER_FOOTER=Object.freeze({
  version:3,
  brand:'EKODI',
  operator:Object.freeze({
    name:'에코디비즈',
    representativeLabel:'대표',
    representative:'정찬균',
    registrationLabel:'사업자등록번호',
    businessRegistrationNumber:'213-13-01959',
  }),
  contact:Object.freeze({
    address:'전남광주통합특별시 무안군 청계면 백련동1길 17-4, 건물 1층',
    email:'joseph@ekodi.kr',
    emailHref:'https://ekodi.kr/mail/contact',
  }),
  legalLinks:Object.freeze([
    link('개인정보처리방침','https://ekodi.kr/privacy','privacy'),
    link('이용약관','https://ekodi.kr/terms','terms'),
    link('문의','https://ekodi.kr/mail/contact','contact'),
  ]),
  copyright:'© 2026 EKODI · EKODIBIZ. All rights reserved.',
  precedenceNotice:'독립 사업자 또는 개별 서비스에 별도 정책이 표시된 경우 해당 정책이 우선 적용됩니다.',
  ariaLabel:'EKODI 운영 및 법적 고지',
});

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const cleanContext=value=>String(value||'').trim().slice(0,120);

export function contactHrefForSite({serviceId='',siteLabel='',sourceUrl=''}={}){
  const url=new URL('https://ekodi.kr/mail/contact');
  const source=cleanContext(serviceId).toLowerCase().replace(/[^a-z0-9-]/g,'');
  const site=cleanContext(siteLabel);
  const original=String(sourceUrl||'').trim().slice(0,1000);
  if(source)url.searchParams.set('source',source);
  if(site)url.searchParams.set('site',site);
  if(original)url.searchParams.set('source_url',original);
  return url.toString();
}

export function renderEkodiUserFooter(config=EKODI_USER_FOOTER,context={}){
  const operator=config.operator||{};
  const contact=config.contact||{};
  const contactHref=contactHrefForSite(context);
  const links=(config.legalLinks||[]).map(item=>{const href=item.i18n==='contact'?contactHref:item.href;return `<a href="${escapeHtml(href)}"${item.i18n?` data-ekodi-i18n="${escapeHtml(item.i18n)}"`:''}>${escapeHtml(item.label)}</a>`}).join('');
  return `<footer class="ekodi-user-ui-footer" data-ekodi-user-footer="v${Number(config.version)||1}" data-ekodi-legal-footer="user-shell-v2" aria-label="${escapeHtml(config.ariaLabel||'EKODI 운영 및 법적 고지')}"><div class="ekodi-user-ui-footer__inner"><div class="ekodi-user-ui-footer__copy"><strong class="ekodi-user-ui-footer__brand">${escapeHtml(config.brand)}</strong><div class="ekodi-user-ui-footer__business"><span>${escapeHtml(operator.name)}</span><span>${escapeHtml(operator.representativeLabel)} ${escapeHtml(operator.representative)}</span><span>${escapeHtml(operator.registrationLabel)} ${escapeHtml(operator.businessRegistrationNumber)}</span></div><div class="ekodi-user-ui-footer__address"><span>${escapeHtml(contact.address)}</span><span class="ekodi-user-ui-footer__separator" aria-hidden="true">·</span><a href="${escapeHtml(contactHref)}" data-ekodi-contact-link="footer-email">${escapeHtml(contact.email)}</a></div><div class="ekodi-user-ui-footer__copyright">${escapeHtml(config.copyright)}</div><div class="ekodi-user-ui-footer__scope">${escapeHtml(config.precedenceNotice)}</div></div><nav class="ekodi-user-ui-footer__links" aria-label="법적 고지">${links}</nav></div></footer>`;
}
