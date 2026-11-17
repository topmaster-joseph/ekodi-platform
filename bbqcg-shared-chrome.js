// One canonical public chrome for the BBQ Muan Cheonggye customer site.
// Both the storefront and the service guide render this exact markup and CSS.
// Independent store identity, workspace access, and data policies live elsewhere.
export const BBQCG_CHROME_VERSION = 'bbqcg-shared-chrome-v1';

export const BBQCG_PUBLIC_NAV = Object.freeze([
  {label:'매장안내',href:'/bbqcg#guide'},
  {label:'BBQ 메뉴',href:'/bbqcg#menu'},
  {label:'주문하기',href:'/bbqcg/order'},
  {label:'매장소식',href:'/bbqcg#notice'},
  {label:'품질약속·자료실',href:'/bbqcg/service-guide'},
  {label:'오시는 길',href:'/bbqcg#directions'}
]);

export function renderBbqcgHeader(){
  const links=BBQCG_PUBLIC_NAV.map(item=>`<a href="${item.href}">${item.label}</a>`).join('');
  return `<header class="header" data-ekodi-user-header-root="bbqcg-v1"><div class="wrap head">
<a class="logo" href="/bbqcg" aria-label="BBQ 무안청계점 홈"><span class="logo-mark" aria-hidden="true">BBQ</span><span class="logo-copy">BBQ 무안청계점<small>우리 동네 BBQ · 무안청계점</small></span></a>
<nav class="nav" aria-label="주요 메뉴">${links}<span class="bbqcg-account-slot" data-ekodi-header-actions aria-label="회원 계정"></span></nav>
</div></header>`;
}

export function renderBbqcgFooter(){
  const year=new Date().getUTCFullYear();
  return `<footer class="foot"><div class="wrap foot-inner"><div class="foot-copy">© ${year} EKODI (에코디). All rights reserved.</div><div class="foot-brand"><strong class="foot-note">BBQ 무안청계점</strong><span class="foot-meta">우리 동네 BBQ · 무안청계점</span></div><nav class="links" aria-label="매장 운영 링크"><a href="https://bbq.co.kr/" target="_blank" rel="noopener noreferrer">BBQ 공식 사이트</a><a href="/bbqcg/admin">매장 운영관리</a></nav></div></footer>`;
}

// Style rules must be defined here once, then appended after each page's own
// content stylesheet. Page-specific styles must not redefine .header/.foot.
export function bbqcgSharedChromeCss(){
  return `
/* bbqcg-shared-chrome-v1: identical storefront and service-guide chrome */
body .header{position:sticky!important;top:0!important;z-index:30!important;background:#fff!important;color:#191a3e!important;border-bottom:3px solid #e7bf7b!important;box-shadow:0 4px 18px #10134709!important}
body .header .wrap,body .foot .wrap{width:min(1300px,calc(100% - 48px))!important;margin-inline:auto!important;max-width:1300px!important;min-width:0!important}
body .header .head{display:flex!important;align-items:center!important;justify-content:space-between!important;flex-wrap:nowrap!important;gap:22px!important;min-height:78px!important;padding:10px 0!important}
body .header .logo{display:flex!important;align-items:center!important;gap:16px!important;min-width:0!important;color:#191a3e!important;text-decoration:none!important;white-space:nowrap!important}
body .header .logo-mark{font:1000 39px/1 Arial,sans-serif!important;letter-spacing:-.09em!important;color:#ca1730!important;white-space:nowrap!important}
body .header .logo-copy{display:block!important;border-left:1px solid #d8d9df!important;padding-left:15px!important;font-size:21px!important;line-height:1.4!important;font-weight:900!important;letter-spacing:-.06em!important;color:#191a3e!important;white-space:nowrap!important}
body .header .logo-copy small{display:block!important;margin-top:2px!important;font-size:10px!important;letter-spacing:.03em!important;font-weight:650!important;color:#626a7c!important}
body .header .nav{display:flex!important;align-items:center!important;justify-content:flex-end!important;flex-wrap:nowrap!important;gap:clamp(10px,1.8vw,30px)!important;font-size:14px!important;font-weight:800!important;white-space:nowrap!important;min-width:0!important;color:#191a3e!important}
body .header .nav a{display:inline-flex!important;align-items:center!important;min-height:44px!important;padding:9px 0!important;color:#191a3e!important;text-decoration:none!important;white-space:nowrap!important;font-weight:800!important}
body .header .nav a:hover{color:#a1192d!important}
body .header .bbqcg-account-slot{display:inline-flex!important;align-items:center!important;justify-content:flex-end!important;min-width:0!important;min-height:44px!important;white-space:nowrap!important}
body .header .nav a:not(:last-child):after{content:"";display:inline-block;width:1px;height:12px;margin-left:clamp(10px,1.8vw,30px);background:#d8d6dc;vertical-align:middle}
body .foot{display:block!important;background:#151639!important;color:#e8e8f2!important;padding:25px 0!important;border-top:0!important;font-size:12px!important;line-height:1.7!important;min-height:0!important}
body .foot .foot-inner{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;align-items:center!important;gap:22px!important}
body .foot .foot-copy{font-size:12px!important;color:#d4d6e6!important;text-align:left!important}
body .foot .foot-brand{display:flex!important;align-items:center!important;justify-content:center!important;flex-direction:column!important;gap:4px!important;padding:0 20px!important;text-align:center!important;border-left:1px solid #77799880!important;border-right:1px solid #77799880!important}
body .foot .foot-note{font-size:14px!important;font-weight:850!important;color:#fff!important}
body .foot .foot-meta{font-size:11px!important;color:#c6c8db!important}
body .foot .links{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:18px!important;flex-wrap:wrap!important}
body .foot .links a{color:#eff0f9!important;font-size:12px!important;font-weight:750!important;text-decoration:none!important}
body .foot .links a:hover{text-decoration:underline!important;text-underline-offset:4px!important}
body .header a:focus-visible,body .foot a:focus-visible{outline:3px solid #c78e37!important;outline-offset:4px!important;border-radius:4px!important}
@media(max-width:1100px){
 body .header .head{min-height:72px!important;gap:14px!important}
 body .header .logo-mark{font-size:31px!important}
 body .header .logo-copy{font-size:18px!important}
 body .header .nav{font-size:12px!important}
}
@media(max-width:820px){
 body .header .head{flex-wrap:wrap!important;gap:7px 14px!important}
 body .header .nav{width:100%!important;max-width:100%!important;overflow-x:auto!important;justify-content:flex-start!important;scrollbar-width:none!important;gap:16px!important}
 body .header .nav::-webkit-scrollbar{display:none}
 body .header .nav a{padding:7px 0 10px!important}
 body .header .nav a:not(:last-child):after{margin-left:16px!important}
 body .foot .foot-inner{grid-template-columns:1fr!important;gap:14px!important;align-items:start!important}
 body .foot .foot-brand{align-items:flex-start!important;border:0!important;text-align:left!important;padding:0!important}
 body .foot .links{justify-content:flex-start!important}
}
@media(max-width:600px){
 body .header .wrap,body .foot .wrap{width:calc(100% - 32px)!important}
 body .header .head{min-height:68px!important}
 body .header .logo{gap:11px!important}
 body .header .logo-mark{font-size:30px!important}
 body .header .logo-copy{font-size:16px!important;padding-left:11px!important}
 body .header .logo-copy small{font-size:9px!important}
}
@media print{body .header .nav,body .foot .links{display:none!important}body .header{position:static!important;box-shadow:none!important}}
@media(prefers-reduced-motion:reduce){body .header .nav a{transition:none!important}}
`;
}
