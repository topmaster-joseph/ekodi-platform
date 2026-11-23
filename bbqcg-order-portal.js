import {renderBbqcgHeader,renderBbqcgFooter,bbqcgSharedChromeCss} from './bbqcg-shared-chrome.js';

// The public QR checkout on-ramp is a read-only customer surface.
// Actual payment/order mutation requires a separate merchant-specific,
// server-confirmed and audited payment/notification adapter. Do not toggle
// this gate just because the catalog or the store's order_enabled flag changes.
export const BBQCG_ORDER_PATH='/bbqcg/order';
export const BBQCG_REAL_PAYMENT_ENABLED=false;
export const BBQCG_ORDER_APPROVAL_NOTE='온라인 결제 및 매장 자동 접수는 아직 준비 중입니다.';
const OFFICIAL='https://bbq.co.kr/';
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text=(value,max=120)=>String(value??'').trim().slice(0,max);

export function verifiedBbqcgMenu(snapshot){
  if(!Array.isArray(snapshot?.menu))return [];
  const unique=new Set();
  return snapshot.menu.filter(row=>{
    const id=text(row?.id,40);
    const name=text(row?.name,80);
    const n=row?.base_price;
    const price=typeof n==='number'?n:Number.NaN;
    const basis=text(row?.source_basis,40);
    if(!uuid.test(id)||unique.has(id)||!name||!Number.isSafeInteger(price)||price<=0||price>500000)return false;
    if(!['brand_official','platform_verified','operator_verified','pos_verified'].includes(basis))return false;
    if(!row?.verified_at||!Number.isFinite(Date.parse(row.verified_at)))return false;
    if(text(row.availability,40).toLowerCase()!=='available')return false;
    unique.add(id);return true;
  }).slice(0,60).map(row=>Object.freeze({
    id:text(row.id,40),name:text(row.name,80),category:text(row.category||'메뉴',40),
    description:text(row.description,240),price:Number(row.base_price)
  }));
}

// Merchant PG credentials, HQ authorization and verified store notification
// have not been established. No customer button may bypass these server gates.
export function bbqcgOrderReadiness(input={}){
  const menu=verifiedBbqcgMenu(input.snapshot);
  return Object.freeze({
    menuCount:menu.length,
    catalogReady:menu.length>0,
    checkoutReady:BBQCG_REAL_PAYMENT_ENABLED &&
      input.storePublished===true && input.orderEnabled===true &&
      input.merchantVerified===true && input.notificationVerified===true &&
      menu.length>0,
    paymentActivation:'merchant_approval_required',
    notificationActivation:'recipient_verification_required'
  });
}

async function publicSnapshot(env,fetchImpl){
  if(!env?.SUPABASE_URL||!env?.SUPABASE_PUBLISHABLE_KEY)return null;
  try{
    const response=await fetchImpl(new URL('/rest/v1/rpc/bbqcg_qr_public_catalog',env.SUPABASE_URL),{
      method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json','cache-control':'no-store'},
      body:JSON.stringify({p_slug:'bbqcg'})
    });
    return response.ok?await response.json():null;
  }catch{return null}
}

function phoneHref(value){
  const digits=String(value??'').replace(/[^0-9+]/g,'');
  return digits.length>=8&&digits.length<=16?'tel:'+digits:'';
}
export function bbqcgOrderPortalCss(){
  return new Response(String.raw`
:root{color-scheme:light;--ink:#191a3e;--paper:#fffaf4;--line:#ece6df}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:system-ui,-apple-system,"Noto Sans KR","Malgun Gothic",sans-serif;line-height:1.6}
a{color:inherit}.skip{position:absolute;left:-9999px}.skip:focus{left:12px;top:12px;background:#fff;z-index:50}
.wrap{width:min(1300px,calc(100% - 48px));margin:0 auto}
.order-hero{background:linear-gradient(120deg,#111342,#25235d);color:#fff;padding:42px 0}
.order-hero p{margin:0;color:#f0d49d;font-size:13px;font-weight:800;letter-spacing:.09em}
.order-hero h1{font-size:clamp(29px,4vw,48px);letter-spacing:-.055em;margin:9px 0}
.order-hero .lead{max-width:700px;color:#e8e7f2;font-size:15px;font-weight:450;letter-spacing:0}
.order-body{padding-top:28px;padding-bottom:58px}
.order-notice{background:#fff3e7;border:1px solid #d2a377;border-radius:14px;padding:16px 18px;color:#5a331c}
.order-notice strong{display:block;font-size:17px}.order-notice p{margin:5px 0 0}
.order-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:25px;margin-top:25px;align-items:start}
.order-layout h2{font-size:23px;margin:0 0 10px;letter-spacing:-.04em}
.order-menu{display:grid;gap:12px}
.order-menu article{background:#fff;border:1px solid var(--line);border-radius:15px;padding:17px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center}
.order-menu h3{margin:3px 0;font-size:18px}.order-menu small{color:#77718a}.order-menu p{font-size:13px;color:#5c6076;margin:3px 0 0}.order-menu .price{font-weight:850;color:#161746}
.order-menu input{width:72px;height:42px;border:1px solid #aaa7af;border-radius:9px;padding:7px;font-size:16px}
.order-empty{background:#fff;border:1px dashed #bcb5b2;border-radius:15px;padding:24px;line-height:1.8;color:#41495e}
.order-sidebar{background:#fff;border:1px solid var(--line);border-radius:15px;padding:18px;box-shadow:0 5px 23px #1b19400d}
.order-sidebar h2{font-size:20px}.order-sidebar .total{display:flex;justify-content:space-between;gap:12px;border-top:1px solid var(--line);padding:15px 0;margin-top:16px;font-weight:850}
.order-sidebar button{display:block;width:100%;min-height:50px;border:0;border-radius:10px;background:#e5e3e4;color:#56515b;font:inherit;font-weight:800;cursor:not-allowed}
.order-sidebar .help{font-size:12px;color:#5c6174}.order-actions{display:grid;gap:10px;margin-top:13px}
.order-actions a{display:flex;align-items:center;justify-content:center;min-height:44px;padding:9px 16px;background:#161747;color:#fff;border-radius:11px;text-decoration:none;font-weight:800}
.order-actions a.phone{background:#f2d39c;color:#141435}
.order-steps{margin-top:30px;padding:16px 20px;border:1px solid var(--line);border-radius:14px;background:#fff}
.order-steps strong{display:block}.order-steps p{font-size:13px;color:#5b6174;margin:5px 0}
.order-body a:focus-visible,.order-body input:focus-visible{outline:3px solid #c7872b;outline-offset:3px}
@media(max-width:820px){.order-layout{grid-template-columns:1fr}.order-sidebar{order:2}}
@media(max-width:560px){.wrap{width:calc(100% - 32px)}.order-hero{padding:30px 0}.order-menu article{grid-template-columns:1fr}.order-menu input{width:100%}.order-body{padding-top:20px;padding-bottom:36px}}
`+bbqcgSharedChromeCss(),{headers:{'content-type':'text/css; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});
}

export function bbqcgOrderClientScript(){
  const script=String.raw`(()=>{
  'use strict';
  const form=document.getElementById('bbqcgOrderPreview');
  const output=document.getElementById('bbqcgCartTotal');
  if(!form||!output)return;
  const recalculate=()=>{
    let total=0;
    for(const input of form.querySelectorAll('input[data-item-price]')){
      const qty=Number.parseInt(input.value,10);
      const price=Number.parseInt(input.dataset.itemPrice,10);
      const amount=Number.isSafeInteger(qty)&&qty>=0&&qty<=10?qty:0;
      if(input.value!==String(amount))input.value=String(amount);
      if(Number.isSafeInteger(price)&&price>0)total+=amount*price;
    }
    output.textContent=total.toLocaleString('ko-KR')+'원';
  };
  form.addEventListener('input',recalculate);
  form.addEventListener('submit',event=>{event.preventDefault()});
  recalculate();
})();`;
  return new Response(script,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});
}

export async function renderBbqcgOrderPortal(request,env={},fetchImpl=fetch){
  if(!['GET','HEAD'].includes(request.method)){
    return new Response(null,{status:405,headers:{allow:'GET, HEAD','cache-control':'no-store'}});
  }
  const snapshot=await publicSnapshot(env,fetchImpl);
  const menu=verifiedBbqcgMenu(snapshot);
  const phone=phoneHref(snapshot?.store?.phone);
  const readablePhone=phone?esc(snapshot.store.phone):'';
  const menuMarkup=menu.length?menu.map(row=>
    `<article><div><small>${esc(row.category)}</small><h3>${esc(row.name)}</h3><p>${esc(row.description)}</p><span class="price">${row.price.toLocaleString('ko-KR')}원</span></div><div><label for="q-${esc(row.id)}">수량</label><input id="q-${esc(row.id)}" data-item-price="${row.price}" type="number" inputmode="numeric" value="0" min="0" max="10" step="1" aria-label="${esc(row.name)} 수량"></div></article>`
  ).join(''):'<div class="order-empty"><strong>판매 메뉴 등록을 준비하고 있습니다.</strong><p>매장 승인 메뉴·실제 판매가격이 확인되면 이 화면에서 상품을 직접 선택할 수 있습니다. 지금은 BBQ 공식 주문 사이트에서 메뉴와 가격을 확인해 주세요.</p></div>';
  const html=`<!doctype html><html lang="ko" data-store-entity="bbqcg"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><meta name="theme-color" content="#161747">
<meta name="description" content="BBQ 무안청계점 QR 모바일 메뉴·주문 안내. 공식 판매가격 확인 및 주문 결제 연결 준비 상태를 확인합니다.">
<link rel="canonical" href="https://ekodi.kr/bbqcg/order">
<link rel="stylesheet" href="/bbqcg/assets/order.css?v=20261117a">
<title>QR 메뉴·주문 안내 | BBQ 무안청계점</title></head><body>
<a class="skip" href="#main">본문으로 이동</a>${renderBbqcgHeader()}
<main id="main"><section class="order-hero"><div class="wrap"><p>BBQ MUAN CHEONGGYE · MOBILE MENU</p><h1>QR 메뉴·주문 안내</h1><p class="lead">매장별로 확인된 메뉴와 가격을 이곳에서 살펴보세요. 주문·결제와 매장 접수는 운영 준비 확인 후 개통됩니다.</p></div></section>
<div class="wrap order-body"><section class="order-notice" role="status" aria-live="polite"><strong>${BBQCG_ORDER_APPROVAL_NOTE}</strong><p>현재 이 화면에서 금액을 결제하거나 주문을 매장으로 전송할 수 없습니다. 주문을 원하시면 공식 BBQ 주문 또는 매장 전화로 진행해 주세요.</p></section>
<div class="order-layout"><section aria-labelledby="catalogTitle"><h2 id="catalogTitle">매장 판매 메뉴</h2><form id="bbqcgOrderPreview" aria-label="메뉴 확인 및 장바구니 미리보기">${menuMarkup}</form></section>
<aside class="order-sidebar" aria-label="주문·결제 안내"><h2>선택한 메뉴</h2><p class="help">매장에 승인된 메뉴만 계산됩니다. 아래 합계는 참고용이며 결제가 진행되지 않습니다.</p><div class="total"><span>미리보기 합계</span><strong id="bbqcgCartTotal">0원</strong></div><button type="button" disabled aria-disabled="true">결제·매장 접수 준비 중</button><div class="order-actions"><a href="${OFFICIAL}" target="_blank" rel="noopener noreferrer">BBQ 공식 메뉴·주문</a>${phone?`<a class="phone" href="${esc(phone)}">매장 전화 ${readablePhone}</a>`:''}</div><p class="help">결제 승인 전에는 매장 접수, 결제 완료 안내, 주문 알림이 발송되지 않습니다.</p></aside></div>
<section class="order-steps"><strong>QR 주문 서비스 적용 절차</strong><p>① 매장 메뉴·가격 확정 → ② 독립 결제 가맹점 승인 및 서버 검증 → ③ 주문 접수함·알림 수신 검증 → ④ 실거래 테스트 후 개통</p></section></div></main>
${renderBbqcgFooter()}<script defer src="/bbqcg/assets/order-client.js?v=20261117a"></script></body></html>`;
  return new Response(request.method==='HEAD'?null:html,{headers:{
    'content-type':'text/html; charset=utf-8','cache-control':'no-store',
    'x-robots-tag':'noindex,nofollow,noarchive','x-ekodi-workspace':'bbqcg','x-ekodi-order-mode':'read-only-until-verified'
  }});
}
