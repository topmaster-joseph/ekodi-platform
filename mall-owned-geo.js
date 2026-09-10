const MALL_PREFIX='/ekodibiz/mall';
const API_ROOT='https://api.ekodi.kr/api/affiliate/public';
const GROWTH_HEALTH='https://marketing-connect-api.ekodi.kr/health';
const STORE='ekodi-mall';
const SITE='https://ekodi.kr';
const clean=(value,max=500)=>String(value??'').trim().slice(0,max);
const html=value=>clean(value,5000).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const xml=value=>html(value);
const safeJson=value=>JSON.stringify(value).replaceAll('<','\\u003c');
const krw=value=>new Intl.NumberFormat('ko-KR').format(Math.max(0,Number(value)||0));

async function fetchJson(url){
  const response=await fetch(url,{headers:{accept:'application/json'}});
  if(!response.ok) return {ok:false,status:response.status,data:null};
  return {ok:true,status:response.status,data:await response.json().catch(()=>null)};
}

function productPath(pathname){
  const match=pathname.match(/^\/ekodibiz\/mall\/p\/(\d+)\/?$/);
  return match?Number(match[1]):0;
}
function productDocument(product,disclosure,url){
  const canonical=`${SITE}${MALL_PREFIX}/p/${Number(product.id)}`;
  const title=clean(product.productName,240);
  const category=clean(product.category||'추천',80);
  const provider=clean(product.providerName||'판매처',80);
  const imageUrl=clean(product.imageUrl,1000);
  const clickUrl=clean(product.clickUrl,1000);
  const price=Math.max(0,Number(product.priceKrw)||0);
  const description=`${title} · ${category} · ${price?`${krw(price)}원`:'가격은 판매처에서 확인'} · ${provider} 연결 상품`;
  const structured={
    '@context':'https://schema.org','@type':'Product',name:title,
    image:imageUrl?[imageUrl]:undefined,category,
    url:canonical,
    offers:{'@type':'Offer',priceCurrency:'KRW',...(price?{price}:{}),url:clickUrl,seller:{'@type':'Organization',name:provider}},
  };
  const campaign=clean(url.searchParams.get('utm_campaign'),160);
  const tracking=/^mall-\d{8}-(facebook|instagram|threads)-\d+$/.test(campaign)
    ? `data-campaign="${html(campaign)}"` : '';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${html(title)} | EKODI MALL</title><meta name="description" content="${html(description)}"><meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${canonical}"><link rel="alternate" type="application/rss+xml" title="EKODI MALL 주간 추천" href="${SITE}${MALL_PREFIX}/feed.xml">
<meta property="og:type" content="product"><meta property="og:site_name" content="EKODI MALL"><meta property="og:title" content="${html(title)}"><meta property="og:description" content="${html(description)}"><meta property="og:url" content="${canonical}">${imageUrl?`<meta property="og:image" content="${html(imageUrl)}">`:''}
<meta name="twitter:card" content="summary_large_image"><meta property="product:price:currency" content="KRW">${price?`<meta property="product:price:amount" content="${price}">`:''}
<script type="application/ld+json">${safeJson(structured)}</script>
<style>body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Noto Sans KR",sans-serif;background:#f6f7f8;color:#151719}.geo-wrap{max-width:920px;margin:auto;padding:28px 20px 56px}.crumb{font-size:14px;margin-bottom:18px}.crumb a{color:inherit}.card{background:white;border:1px solid #e4e7ea;border-radius:20px;padding:24px;display:grid;grid-template-columns:minmax(240px,42%) 1fr;gap:28px}.media img{width:100%;aspect-ratio:1/1;object-fit:contain;border-radius:14px;background:#fafafa}.tag{font-size:13px;color:#5b6168}.price{font-size:26px;font-weight:800;margin:18px 0}.buy{display:inline-block;padding:14px 20px;border-radius:12px;background:#151719;color:#fff;text-decoration:none;font-weight:700}.notice{margin-top:18px;font-size:13px;line-height:1.6;color:#626870}.facts{margin:24px 0 0;padding:0;list-style:none}.facts li{padding:8px 0;border-top:1px solid #eceeef}@media(max-width:700px){.card{grid-template-columns:1fr}}</style></head><body><main class="geo-wrap" itemscope itemtype="https://schema.org/Product">
<nav class="crumb"><a href="${SITE}${MALL_PREFIX}">EKODI MALL</a> › ${html(category)}</nav><article class="card"><div class="media">${imageUrl?`<img src="${html(imageUrl)}" alt="${html(title)}" itemprop="image">`:''}</div><div><p class="tag">${html(category)} · ${html(provider)}</p><h1 itemprop="name">${html(title)}</h1>
${price?`<p class="price"><span itemprop="offers" itemscope itemtype="https://schema.org/Offer"><meta itemprop="priceCurrency" content="KRW"><meta itemprop="price" content="${price}">${krw(price)}원</span></p>`:''}
<a id="geoBuy" class="buy" href="${html(clickUrl)}" rel="sponsored noopener noreferrer" ${tracking}>${html(product.buyLabel||'판매처에서 구매')}</a>
<ul class="facts"><li>판매처: ${html(provider)}</li><li>배송·재고·최종 가격은 판매처에서 확인합니다.</li>${product.isRocket?'<li>로켓배송 표시 상품</li>':''}</ul>
<p class="notice">${html(disclosure||product.disclosureText||'')}</p></div></article></main>
<script>(()=>{const b=document.getElementById('geoBuy');const c=b?.dataset?.campaign;if(!b||!c)return;b.addEventListener('click',()=>{fetch('https://marketing-connect-api.ekodi.kr/r/mall/outbound/'+encodeURIComponent(c)+'/${Number(product.id)}',{method:'POST',keepalive:true,credentials:'omit'}).catch(()=>{});},{once:true});})();</script></body></html>`;
}
async function weeklyItems(){
  const growth=await fetchJson(GROWTH_HEALTH).catch(()=>({ok:false,data:null}));
  const board=growth.data?.mallPromotionAutomation?.weeklyBoard;
  if(growth.ok&&Array.isArray(board?.primary)&&board.primary.length){
    return {generatedAt:board.generatedAt||new Date().toISOString(),weekKey:board.weekKey||'',items:board.primary.slice(0,7).map(row=>({id:Number(row.productRowId),name:clean(row.productName,240),category:clean(row.category||'추천',80)})).filter(row=>row.id>0)};
  }
  const catalog=await fetchJson(`${API_ROOT}/products?storefront=${STORE}&limit=7`).catch(()=>({ok:false,data:null}));
  const products=Array.isArray(catalog.data?.products)?catalog.data.products:[];
  return {generatedAt:new Date().toISOString(),weekKey:'fallback',items:products.slice(0,7).map(row=>({id:Number(row.id),name:clean(row.productName,240),category:clean(row.category||'추천',80)})).filter(row=>row.id>0)};
}

function feedDocument(payload){
  const updated=clean(payload.generatedAt,40)||new Date().toISOString();
  const items=payload.items.map(row=>`<item><title>${xml(row.name)}</title><link>${SITE}${MALL_PREFIX}/p/${row.id}</link><guid isPermaLink="true">${SITE}${MALL_PREFIX}/p/${row.id}</guid><category>${xml(row.category)}</category><pubDate>${new Date(updated).toUTCString()}</pubDate></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>EKODI MALL 주간 추천</title><link>${SITE}${MALL_PREFIX}</link><description>공식 쇼핑 신호와 주간 선정 기준으로 고른 EKODI MALL 상품</description><lastBuildDate>${new Date(updated).toUTCString()}</lastBuildDate>${items}</channel></rss>`;
}

function sitemapDocument(payload){
  const lastmod=clean(payload.generatedAt,40).slice(0,10)||new Date().toISOString().slice(0,10);
  const urls=payload.items.map(row=>`<url><loc>${SITE}${MALL_PREFIX}/p/${row.id}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}${MALL_PREFIX}</loc><changefreq>daily</changefreq><priority>0.9</priority></url>${urls}</urlset>`;
}
function response(body,status,contentType,cache='public, max-age=300, stale-while-revalidate=3600'){
  return new Response(body,{status,headers:{'content-type':contentType,'cache-control':cache,'x-content-type-options':'nosniff','x-ekodi-owned-promotion':'geo-v1'}});
}

export function isMallOwnedGeoPath(pathname){
  return Boolean(productPath(pathname))||pathname===`${MALL_PREFIX}/feed.xml`||pathname===`${MALL_PREFIX}/sitemap.xml`;
}

export async function handleMallOwnedGeoRequest(request){
  const url=new URL(request.url);
  if(!['GET','HEAD'].includes(request.method)||!isMallOwnedGeoPath(url.pathname)) return null;
  if(url.pathname===`${MALL_PREFIX}/feed.xml`){
    const payload=await weeklyItems();
    return response(request.method==='HEAD'?null:feedDocument(payload),200,'application/rss+xml; charset=utf-8','public, max-age=600, stale-while-revalidate=3600');
  }
  if(url.pathname===`${MALL_PREFIX}/sitemap.xml`){
    const payload=await weeklyItems();
    return response(request.method==='HEAD'?null:sitemapDocument(payload),200,'application/xml; charset=utf-8','public, max-age=600, stale-while-revalidate=3600');
  }
  const id=productPath(url.pathname);
  const detail=await fetchJson(`${API_ROOT}/product/${id}?storefront=${STORE}`).catch(()=>({ok:false,status:503,data:null}));
  if(!detail.ok||!detail.data?.product) return response(request.method==='HEAD'?null:'상품을 찾을 수 없습니다.',detail.status===404?404:503,'text/plain; charset=utf-8','no-store');
  const doc=productDocument(detail.data.product,detail.data.disclosureText,url);
  return response(request.method==='HEAD'?null:doc,200,'text/html; charset=utf-8');
}
