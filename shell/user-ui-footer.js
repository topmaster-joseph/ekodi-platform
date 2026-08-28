(()=>{
'use strict';
if(window.__EKODI_USER_UI_FOOTER_BOOTED)return;
window.__EKODI_USER_UI_FOOTER_BOOTED=true;

const VERSION=1;
const STYLE_ID='ekodi-user-ui-footer-style';
const USER_SURFACES=new Set(['public','workspace']);
const FOOTER_ATTR='data-ekodi-user-footer';

function surface(){return String(document.documentElement.dataset.ekodiShellSurface||'').toLowerCase();}
function enabled(){return USER_SURFACES.has(surface());}
function installStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    .ekodi-user-ui-footer{position:relative;z-index:2;margin-top:32px;border-top:1px solid color-mix(in srgb,var(--ekodi-shell-border,#dfe4df) 70%,transparent);background:color-mix(in srgb,var(--ekodi-shell-surface,#fafaf7) 94%,transparent);backdrop-filter:blur(12px);color:var(--ekodi-shell-muted,#536158);font:12px/1.65 system-ui,-apple-system,"Noto Sans KR","Malgun Gothic",sans-serif}
    .ekodi-user-ui-footer__inner{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:24px 0 28px;display:grid;gap:7px}
    .ekodi-user-ui-footer__top{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
    .ekodi-user-ui-footer__brand{font-weight:800;letter-spacing:.12em;color:var(--ekodi-shell-text,#18251d)}
    .ekodi-user-ui-footer__links,.ekodi-user-ui-footer__business{display:flex;gap:5px 12px;flex-wrap:wrap}.ekodi-user-ui-footer__links{gap:14px}
    .ekodi-user-ui-footer a{color:var(--ekodi-shell-focus,#315d48);text-decoration:none;text-underline-offset:3px}.ekodi-user-ui-footer a:hover,.ekodi-user-ui-footer a:focus-visible{text-decoration:underline}.ekodi-user-ui-footer a:focus-visible{outline:2px solid currentColor;outline-offset:3px}
    .ekodi-user-ui-footer__address{word-break:keep-all}.ekodi-user-ui-footer__copyright{margin-top:2px;opacity:.78}.ekodi-user-ui-footer__scope{margin-top:3px;opacity:.68;font-size:11px}
    [data-ekodi-legal-footer]:not(.ekodi-user-ui-footer){display:none!important}
    @media(max-width:640px){.ekodi-user-ui-footer__inner{width:min(100% - 24px,1180px);padding:20px 0 24px}.ekodi-user-ui-footer__top{align-items:flex-start;flex-direction:column}.ekodi-user-ui-footer__links{gap:8px 12px}.ekodi-user-ui-footer__business{display:grid;gap:2px}}
  `;
  (document.head||document.documentElement).append(style);
}
function createFooter(){
  const footer=document.createElement('footer');
  footer.className='ekodi-user-ui-footer';
  footer.setAttribute(FOOTER_ATTR,`v${VERSION}`);
  footer.setAttribute('data-ekodi-legal-footer','user-shell-v1');
  footer.setAttribute('aria-label','EKODI 운영 및 법적 고지');
  footer.innerHTML=`<div class="ekodi-user-ui-footer__inner"><div class="ekodi-user-ui-footer__top"><strong class="ekodi-user-ui-footer__brand">EKODI</strong><nav class="ekodi-user-ui-footer__links" aria-label="법적 고지"><a href="https://ekodi.kr/privacy">개인정보처리방침</a><a href="https://ekodi.kr/terms">이용약관</a><a href="mailto:ekodibiz@gmail.com">문의</a></nav></div><div class="ekodi-user-ui-footer__business"><span>운영주체 에코디비즈</span><span>대표 정찬균</span><span>사업자등록번호 213-13-01959</span></div><div class="ekodi-user-ui-footer__address">사업장 소재지 전남광주통합특별시 무안군 청계면 백련동1길 17-4, 건물 1층 · <a href="mailto:ekodibiz@gmail.com">ekodibiz@gmail.com</a></div><div class="ekodi-user-ui-footer__copyright">© 2026 EKODI · EKODIBIZ. All rights reserved.</div><div class="ekodi-user-ui-footer__scope">독립 운영주체 또는 개별 서비스에 별도 정책이 표시된 경우 해당 정책이 우선 적용됩니다.</div></div>`;
  return footer;
}
function reconcile(){
  if(!enabled())return;
  installStyle();
  if(document.querySelector(`[${FOOTER_ATTR}]`))return;
  if(!document.body)return;
  document.body.append(createFooter());
  window.dispatchEvent(new CustomEvent('ekodi:user-footer-ready',{detail:{version:VERSION,surface:surface()}}));
}
window.EKODIUserUIFooter=Object.freeze({version:VERSION,refresh:reconcile});
window.addEventListener('ekodi:shell-theme',reconcile);
window.addEventListener('ekodi:surface-change',reconcile);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',reconcile,{once:true});else reconcile();
})();
