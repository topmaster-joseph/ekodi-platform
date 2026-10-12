// Public-only search/answer metadata for the static EKODI Mall catalog.
// A prepared, unpriced or unverified listing is NOT an offer for sale.
const finitePrice = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const available = new Set(['in_stock','out_of_stock','preorder']);
const availabilityUrl = {
  in_stock:'https://schema.org/InStock',
  out_of_stock:'https://schema.org/OutOfStock',
  preorder:'https://schema.org/PreOrder'
};
const clean = (value, max = 240) => String(value ?? '').trim().slice(0,max);
const checkoutFor = (product, site) => {
  const raw = clean(product?.action?.url,2048);
  if (product?.action?.type !== 'checkout' || !raw) return null;
  try {
    const base = new URL(site.seo.baseUrl);
    const destination = new URL(raw,base);
    const prefix = base.pathname.replace(/\/$/,'');
    if (destination.origin !== base.origin || !destination.pathname.startsWith(prefix + '/')) return null;
    if (!destination.pathname.includes('/checkout/')) return null;
    return destination.href;
  } catch { return null; }
};
export function eligibleProductOffer({site, product}) {
  return Boolean(product?.published === true
    && site?.commerce?.paymentsEnabled === true
    && product?.saleType === 'direct'
    && product?.verifiedForSale === true
    && product?.salesReadiness === 'verified'
    && finitePrice(product?.price)
    && available.has(product?.stockStatus)
    && checkoutFor(product,site));
}
export function productDiscoveryGraph({site, product, store, productUrl}) {
  const name=clean(product.name,200);
  const description=clean(product.description,500);
  const url=new URL(productUrl).href;
  const itemId=url + '#item';
  const ready=eligibleProductOffer({site,product});
  const page = {
    '@type':'WebPage', '@id':url + '#webpage', url,
    name:name + ' | EKODI MALL',
    description, inLanguage:'ko-KR',
    isPartOf:{'@type':'WebSite','@id':site.seo.baseUrl.replace(/\/$/,'') + '/#website'},
    about:ready ? {'@id':itemId} : {'@type':'Thing',name,description}
  };
  if (!ready) return {'@context':'https://schema.org','@graph':[page]};
  const item = {
    '@type':'Product','@id':itemId,name,description,url,
    brand:{'@type':'Brand',name:clean(store?.name || site.brand.name,200)},
    offers:{
      '@type':'Offer',url:checkoutFor(product,site),
      price:product.price,priceCurrency:'KRW',
      availability:availabilityUrl[product.stockStatus]
    }
  };
  return {'@context':'https://schema.org','@graph':[page,item]};
}
export function renderProductDiscoveryJsonLd(input) {
  // Encode < so untrusted merchant copy cannot close the JSON-LD script.
  const safeJson=JSON.stringify(productDiscoveryGraph(input)).replace(/</g,'\\u003c');
  return '<script type="application/ld+json">' + safeJson + '</script>';
}
