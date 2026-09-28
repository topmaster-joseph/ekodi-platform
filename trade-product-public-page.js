const enc=value=>encodeURIComponent(String(value||'').trim());
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';

export function tradeProductPublicRoute(pathname=''){
  const match=String(pathname||'').match(/^\/ekodibiz\/trade\/products\/([^/]+)\/?$/i);
  return match?{code:decodeURIComponent(match[1])}:null;
}

export function tradeProductPublicPage({code}={}){
  const safeCode=String(code||'').trim();
  const api=`${SUPABASE_URL}/rest/v1/trade_product_public_profiles?select=product_code,public_name,brand,model,short_description,public_specs,list_price_krw,sale_status,publication_status,mall_public_url,image_url,fulfillment,after_sales_note&product_code=eq.${enc(safeCode)}&limit=1`;
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="description" content="에코디무역 공식 상품 구매 페이지"><title>${esc(safeCode)} · 에코디무역</title><style>
  :root{font-family:Inter,"Noto Sans KR",system-ui,sans-serif;color:#152235;background:#f5f7fb}*{box-sizing:border-box}body{margin:0}.wrap{max-width:980px;margin:auto;padding:24px}.top{display:flex;justify-content:space-between;align-items:center;padding:10px 0 24px}.brand{font-weight:900;text-decoration:none;color:#172033}.tag{font-size:12px;color:#607089}.hero{background:#fff;border:1px solid #e4e8ef;border-radius:20px;padding:34px;display:grid;gap:24px}.eyebrow{font-size:12px;font-weight:800;color:#315d9a;letter-spacing:.12em}.hero h1{font-size:clamp(30px,6vw,52px);line-height:1.08;margin:8px 0 12px}.hero p{color:#667085;line-height:1.7;margin:0}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.meta article,.specs article{padding:15px;background:#f7f9fc;border-radius:12px}.meta small,.specs small{display:block;color:#7b8798}.meta strong,.specs strong{display:block;margin-top:4px}.actions{display:flex;gap:10px;flex-wrap:wrap}.button{display:inline-flex;align-items:center;justify-content:center;padding:13px 18px;border-radius:10px;text-decoration:none;border:1px solid #ccd4df;color:#172033;font-weight:800}.primary{background:#172033;color:#fff;border-color:#172033}.disabled{background:#eef1f5;color:#8a94a6;border-color:#dfe4ea;cursor:not-allowed}.note,.panel{margin-top:18px;padding:18px;background:#fff;border:1px solid #e4e8ef;border-radius:14px;color:#657184;line-height:1.65;font-size:13px}.specs{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:12px}.price{font-size:28px;font-weight:900;color:#172033}.product-image{width:100%;max-height:440px;object-fit:contain;border-radius:14px;background:#f7f9fc}.hidden{display:none!important}@media(max-width:640px){.wrap{padding:16px}.hero{padding:22px}.meta,.specs{grid-template-columns:1fr}.actions .button{width:100%}}
  </style></head><body><main class="wrap"><header class="top"><a class="brand" href="/ekodibiz/trade">EKODI TRADE</a><span class="tag">CONSUMER PRODUCT</span></header><section class="hero"><img id="productImage" class="product-image hidden" alt=""><div><span class="eyebrow">OFFICIAL PRODUCT PAGE</span><h1 id="productName">${esc(safeCode)}</h1><p id="productDescription">판매 승인과 상품정보 공개를 준비하고 있습니다.</p></div><div class="meta"><article><small>제품 코드</small><strong>${esc(safeCode)}</strong></article><article><small>판매 상태</small><strong id="saleStatus">판매 준비중</strong></article><article><small>판매가</small><strong id="price">확정 전</strong></article></div><div id="specPanel" class="panel hidden"><strong>제품 사양</strong><div id="specs" class="specs"></div></div><div id="fulfillmentPanel" class="panel hidden"><strong>배송 · 설치</strong><p id="fulfillment"></p></div><div id="afterSalesPanel" class="panel hidden"><strong>A/S</strong><p id="afterSales"></p></div><div class="actions" id="purchaseActions"><span class="button disabled">판매 준비 중</span><a class="button" href="/ekodibiz/trade">에코디무역 보기</a></div></section><div class="note" id="pageNote">인증·계약·판매정책 확인 후 공개 승인된 제품만 구매할 수 있습니다. 내부 계약조건·공급원가·공급사 업무기록은 소비자 페이지에 노출하지 않습니다.</div></main><script>
  (()=>{const API=${JSON.stringify(api)},KEY=${JSON.stringify(SUPABASE_KEY)};
    const byId=id=>document.getElementById(id),money=n=>new Intl.NumberFormat('ko-KR').format(Number(n||0))+'원';
    const statusLabel={preparing:'판매 준비중',available:'구매 가능',sold_out:'품절',discontinued:'판매 종료'};
    const show=(id,text)=>{const el=byId(id);if(!el||!text)return;el.textContent=text;el.parentElement?.classList.remove('hidden');};
    fetch(API,{headers:{apikey:KEY},cache:'no-store'}).then(r=>r.ok?r.json():[]).then(rows=>{
      const p=Array.isArray(rows)?rows[0]:null;if(!p)return;
      byId('productName').textContent=p.public_name||p.product_code;
      document.title=(p.public_name||p.product_code)+' · 에코디무역';
      byId('productDescription').textContent=p.short_description||'에코디무역 공식 판매 제품입니다.';
      byId('saleStatus').textContent=statusLabel[p.sale_status]||p.sale_status||'판매 준비중';
      byId('price').textContent=p.list_price_krw===null||p.list_price_krw===undefined?'가격 문의':money(p.list_price_krw);
      if(p.image_url){const img=byId('productImage');img.src=p.image_url;img.alt=p.public_name||p.product_code;img.classList.remove('hidden');}
      const specs=Array.isArray(p.public_specs)?p.public_specs:[];if(specs.length){const host=byId('specs');host.replaceChildren();for(const item of specs){const card=document.createElement('article'),small=document.createElement('small'),strong=document.createElement('strong');small.textContent=item?.label||'';strong.textContent=item?.value||'';card.append(small,strong);host.append(card);}byId('specPanel').classList.remove('hidden');}
      if(p.fulfillment){byId('fulfillment').textContent=p.fulfillment;byId('fulfillmentPanel').classList.remove('hidden');}
      if(p.after_sales_note){byId('afterSales').textContent=p.after_sales_note;byId('afterSalesPanel').classList.remove('hidden');}
      const actions=byId('purchaseActions');actions.replaceChildren();
      if(p.sale_status==='available'&&p.mall_public_url){const buy=document.createElement('a');buy.className='button primary';buy.href=p.mall_public_url;buy.textContent='에코디몰에서 구매하기';actions.append(buy);}
      else{const wait=document.createElement('span');wait.className='button disabled';wait.textContent=p.sale_status==='sold_out'?'현재 품절':p.sale_status==='discontinued'?'판매 종료':'판매 준비 중';actions.append(wait);}
      const trade=document.createElement('a');trade.className='button';trade.href='/ekodibiz/trade';trade.textContent='에코디무역 보기';actions.append(trade);
    }).catch(()=>{byId('pageNote').textContent='현재 상품 공개정보를 불러오지 못했습니다. 판매 준비 상태를 확인해 주세요.';});
  })();
  </script></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'strict-origin-when-cross-origin','x-ekodi-route':'trade-consumer-product'}});
}
