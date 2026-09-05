(() => {
  'use strict';
  const API = 'https://api.ekodi.kr/api/affiliate/public/products?storefront=ekodi-mall&limit=80';
  const form = document.querySelector('#contextForm');
  const input = document.querySelector('#contextInput');
  const results = document.querySelector('#contextResults');
  const summary = document.querySelector('#contextSummary');
  const disclosure = document.querySelector('#contextDisclosure');
  if (!form || !input || !results) return;
  let affiliateProducts = [];
  let loading = null;

  const safeUrl = (value) => { try { const url = new URL(String(value || '')); return url.protocol === 'https:' ? url.toString() : ''; } catch { return ''; } };
  const money = (value) => Number(value) > 0 ? `${new Intl.NumberFormat('ko-KR').format(Number(value))}원` : '가격 확인';
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const canonical = (value) => clean(value).toLocaleLowerCase('ko-KR').replace(/[^0-9a-z가-힣]/gi, '');
  const tokens = (value) => clean(value).toLocaleLowerCase('ko-KR').split(/[^0-9a-z가-힣]+/i).filter((item) => item.length > 1);
  const text = (tag, className, value) => { const node = document.createElement(tag); if (className) node.className = className; node.textContent = value; return node; };

  function normalizeOffer(raw, index) {
    const clickUrl = safeUrl(raw?.clickUrl);
    if (!clickUrl) return null;
    const price = Number(raw?.priceKrw || 0);
    return { id: String(raw?.id || index), name: clean(raw?.productName || '상품'), category: clean(raw?.category || '추천'), providerKey: clean(raw?.providerKey || 'affiliate'), providerName: clean(raw?.providerName || '제휴 판매처'), priceKrw: Number.isFinite(price) && price > 0 ? price : 0, clickUrl, imageUrl: safeUrl(raw?.imageUrl), priceFreshness: clean(raw?.priceFreshness || ''), priceVerifiedAt: clean(raw?.priceVerifiedAt || raw?.selectedAt || ''), isRocket: Boolean(raw?.isRocket), isFreeShipping: Boolean(raw?.isFreeShipping) };
  }

  function groupOffers(offers) {
    const groups = new Map();
    for (const offer of offers) {
      const key = canonical(offer.name) || offer.id;
      if (!groups.has(key)) groups.set(key, { id: key, name: offer.name, category: offer.category, offers: [] });
      groups.get(key).offers.push(offer);
    }
    return [...groups.values()].map((product) => ({ ...product, offers: product.offers.sort((a, b) => (a.priceKrw || Infinity) - (b.priceKrw || Infinity)) }));
  }

  function normalizeProductIdentity(raw, index) {
    const offers = Array.isArray(raw?.offers) ? raw.offers.map((offer, offerIndex) => normalizeOffer(offer, offerIndex)).filter(Boolean) : [];
    if (!offers.length) return null;
    offers.sort((a, b) => (a.priceKrw || Infinity) - (b.priceKrw || Infinity));
    return {
      id: clean(raw?.productIdentityId || raw?.id || String(index)),
      name: clean(raw?.name || offers[0].name),
      category: clean(raw?.category || offers[0].category || '??'),
      identityConfidence: clean(raw?.identityConfidence || ''),
      offers,
    };
  }

  const RECIPIENTS = [['은사·선생님',['교수님','교수','선생님','스승','은사']],['부모님',['부모님','어머니','아버지','엄마','아빠']],['어르신',['어르신','장로님','권사님']],['거래처',['거래처','협력사','대표님']],['친구',['친구','지인']],['가족',['가족','형제','자매']]];
  const OCCASIONS = [['감사',['감사','답례']],['집들이',['집들이','이사']],['명절',['추석','설날','명절']],['생일',['생일']],['개업',['개업','오픈']],['졸업·입학',['졸업','입학']],['방문',['방문','인사']]];
  const EXPAND = { 건강:['홍삼','건강','차','꿀','견과','영양'], 지역:['전남','지역','로컬','특산','산지'], 지역성:['전남','지역','로컬','특산'], 실용:['생활','주방','리빙','세트'], 친환경:['친환경','재사용','오가닉','유기농'], 고급:['프리미엄','고급','선물세트'], 감사:['선물','세트','프리미엄'], 집들이:['생활','주방','리빙'] };
  function mapped(message, table) { const lower = clean(message).toLocaleLowerCase('ko-KR'); for (const [label, words] of table) if (words.some((word) => lower.includes(word))) return label; return ''; }
  function budget(message) { const matches = [...clean(message).matchAll(/(\d+(?:\.\d+)?)\s*(만원|천원|원)/g)]; if (!matches.length) return 0; return Math.max(...matches.map((match) => Math.round(Number(match[1]) * (match[2] === '만원' ? 10000 : match[2] === '천원' ? 1000 : 1)))); }
  function parse(message) {
    const lower = clean(message).toLocaleLowerCase('ko-KR');
    const recipient = mapped(lower, RECIPIENTS); const occasion = mapped(lower, OCCASIONS); const budgetMax = budget(lower);
    const prefs = ['건강','지역','지역성','실용','친환경','고급','프리미엄','가성비','빠른배송','무료배송','먹거리','생활용품'].filter((word) => lower.includes(word));
    const terms = [...new Set([...tokens(lower), ...prefs.flatMap((pref) => EXPAND[pref] || [pref]), ...(occasion ? EXPAND[occasion] || [occasion] : []), ...(recipient === '은사·선생님' ? ['선물','세트','프리미엄'] : [])])];
    return { message: clean(message), recipient, occasion, budgetMax, prefs, terms };
  }
  function bestPrice(product) { return product.offers.reduce((best, offer) => offer.priceKrw > 0 && (!best || offer.priceKrw < best) ? offer.priceKrw : best, 0); }
  function score(product, context, index) {
    const haystack = `${product.name} ${product.category}`.toLocaleLowerCase('ko-KR');
    let value = Math.max(0, 18 - index * .25);
    for (const term of context.terms) if (haystack.includes(term)) value += 9;
    const price = bestPrice(product);
    if (context.budgetMax && price) value += price <= context.budgetMax ? 24 : price <= context.budgetMax * 1.1 ? 4 : -32;
    if (product.offers.some((offer) => offer.isFreeShipping)) value += 4;
    if (product.offers.some((offer) => offer.isRocket)) value += 3;
    if (/(선물|세트|특산|프리미엄|생활|건강|홍삼|차|꿀|견과)/.test(haystack)) value += 5;
    return value;
  }

  function reasons(product, context) {
    const list = []; const haystack = `${product.name} ${product.category}`.toLocaleLowerCase('ko-KR'); const price = bestPrice(product);
    if (context.budgetMax && price && price <= context.budgetMax) list.push('말씀하신 예산 안에서 살펴볼 수 있습니다');
    if (context.terms.some((term) => haystack.includes(term))) list.push('요청하신 상황·취향과 관련성이 있습니다');
    if (product.offers.length > 1) list.push(`${product.offers.length}개 판매처 선택지가 연결되어 있습니다`);
    if (product.offers.some((offer) => offer.isFreeShipping)) list.push('무료배송 표시가 있는 판매처가 있습니다');
    if (product.offers.some((offer) => offer.isRocket)) list.push('빠른배송 표시가 있는 판매처가 있습니다');
    if (!list.length) list.push('현재 연결된 상품 중 먼저 비교해 볼 만한 선택입니다');
    return list.slice(0, 3);
  }
  function diversified(products, context, limit = 4) {
    const ranked = products.map((product, index) => ({ product, value: score(product, context, index) })).sort((a, b) => b.value - a.value);
    const chosen = []; const providers = new Map();
    for (const entry of ranked) { const provider = entry.product.offers[0]?.providerKey || 'unknown'; if ((providers.get(provider) || 0) >= 1) continue; chosen.push(entry.product); providers.set(provider, 1); if (chosen.length >= limit) return chosen; }
    for (const entry of ranked) { if (chosen.includes(entry.product)) continue; chosen.push(entry.product); if (chosen.length >= limit) break; }
    return chosen;
  }
  function contextLabel(context) { const parts = [context.recipient, context.occasion, context.budgetMax ? `${new Intl.NumberFormat('ko-KR').format(context.budgetMax)}원 이하` : '', ...context.prefs.slice(0, 2)].filter(Boolean); return parts.length ? parts.join(' · ') : '오늘의 에코디 추천'; }
  function offerLink(offer, compact = false) {
    const link = document.createElement('a'); link.href = offer.clickUrl; link.target = '_blank'; link.rel = 'sponsored noopener';
    link.textContent = compact ? `${offer.providerName} · ${money(offer.priceKrw)}` : '판매처에서 보기';
    link.addEventListener('click', () => document.dispatchEvent(new CustomEvent('ekodi:context-offer-click', { detail: { providerKey: offer.providerKey, productName: offer.name } })));
    return link;
  }
  function detailButton(product, context) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'context-detail-button'; button.textContent = '상품·판매처 보기';
    button.addEventListener('click', () => openProductDetail(product, context));
    return button;
  }
  function offerBadges(offer, product) {
    const badges = []; const lowest = bestPrice(product);
    if (product.offers.length > 1 && lowest && offer.priceKrw === lowest) badges.push('현재 표시가 최저');
    if (offer.isRocket) badges.push('빠른배송');
    if (offer.isFreeShipping) badges.push('무료배송');
    if (offer.priceFreshness === 'stale') badges.push('판매처 최신가 확인');
    return badges;
  }
  let offerDialog = null;
  function ensureOfferDialog() {
    if (offerDialog) return offerDialog;
    offerDialog = document.createElement('dialog'); offerDialog.className = 'context-offer-dialog';
    offerDialog.innerHTML = '<div class="context-offer-shell"><button type="button" class="context-dialog-close" aria-label="닫기">×</button><div data-detail-body></div></div>';
    offerDialog.querySelector('.context-dialog-close')?.addEventListener('click', () => offerDialog.close());
    offerDialog.addEventListener('click', (event) => { if (event.target === offerDialog) offerDialog.close(); });
    document.body.append(offerDialog); return offerDialog;
  }
  function openProductDetail(product, context) {
    const dialog = ensureOfferDialog(); const body = dialog.querySelector('[data-detail-body]');
    if (!body) return; body.replaceChildren();
    const header = text('header', 'context-detail-head', '');
    const meta = text('div', 'context-detail-meta', '');
    meta.append(text('span', 'context-fit', contextLabel(context)), text('span', 'context-provider', product.offers.length > 1 ? `판매처 ${product.offers.length}곳` : '현재 연결 판매처 1곳'));
    header.append(meta, text('h2', '', product.name), text('p', 'context-detail-price', bestPrice(product) ? `${money(bestPrice(product))}부터` : '판매처에서 최신 가격 확인'));
    const visual = text('div', 'context-detail-visual', ''); const image = product.offers.find((offer) => offer.imageUrl)?.imageUrl;
    if (image) { const img = document.createElement('img'); img.src = image; img.alt = product.name; img.loading = 'lazy'; visual.append(img); } else visual.append(text('span', '', 'EKODI CURATED'));
    const whySection = text('section', 'context-detail-why', ''); whySection.append(text('h3', '', '왜 이 상품인가'));
    const why = text('ul', 'context-card-reasons', ''); reasons(product, context).forEach((reason) => why.append(text('li', '', reason))); whySection.append(why);
    const offerSection = text('section', 'context-detail-offers', '');
    offerSection.append(text('h3', '', '어디서 살까요?'), text('p', 'context-detail-note', product.offers.length > 1 ? '가격·배송·판매처 조건을 보고 선택하세요. 추천순위와 제휴수수료는 분리합니다.' : '현재 확인된 판매처는 1곳입니다. 다른 검증 판매처가 연결되면 이곳에서 함께 비교됩니다.'));
    const list = text('div', 'context-detail-offer-list', '');
    product.offers.forEach((offer) => {
      const row = text('article', 'context-detail-offer', ''); const copy = text('div', 'context-detail-offer-copy', '');
      copy.append(text('strong', '', offer.providerName), text('span', 'context-detail-offer-price', money(offer.priceKrw)));
      const badges = text('div', 'context-detail-badges', ''); offerBadges(offer, product).forEach((badge) => badges.append(text('span', '', badge))); copy.append(badges);
      const link = offerLink(offer); link.className = 'context-offer-buy'; link.textContent = '판매처에서 구매'; row.append(copy, link); list.append(row);
    });
    offerSection.append(list); body.append(header, visual, whySection, offerSection);
    document.dispatchEvent(new CustomEvent('ekodi:context-product-open', { detail: { productId: product.id, offerCount: product.offers.length } }));
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); } else dialog.setAttribute('open', '');
  }
  function card(product, context, index) {
    const article = text('article', 'context-card', ''); const top = text('div', 'context-card-top', '');
    top.append(text('span', 'context-fit', index === 0 ? '가장 적합' : index === 1 ? '대안' : '함께 비교'), text('span', 'context-provider', product.offers.length > 1 ? `판매처 ${product.offers.length}곳` : product.offers[0]?.providerName || '판매처'));
    article.append(top, text('h3', '', product.name), text('p', 'context-card-price', bestPrice(product) ? `${money(bestPrice(product))}부터` : '판매처에서 가격 확인'));
    const why = text('ul', 'context-card-reasons', ''); reasons(product, context).forEach((reason) => why.append(text('li', '', reason))); article.append(why);
    const action = text('div', 'context-card-action', '');
    action.append(text('small', '', product.offers.length > 1 ? `판매처 ${product.offers.length}곳 비교 가능` : `현재 판매처 · ${product.offers[0]?.providerName || '외부 판매처'}`), detailButton(product, context));
    article.append(action); return article;
  }

  function fallbackCards(context) {
    const cards = [...document.querySelectorAll('#grid [data-product]')].slice(0, 4); results.replaceChildren();
    cards.forEach((item, index) => { const article = text('article', 'context-card', ''); const top = text('div', 'context-card-top', ''); top.append(text('span', 'context-fit', index === 0 ? '먼저 보기' : '큐레이션'), text('span', 'context-provider', item.querySelector('.store-kicker')?.textContent?.trim() || 'EKODI Mall')); article.append(top, text('h3', '', item.dataset.name || '상품')); const why = text('ul', 'context-card-reasons', ''); why.append(text('li', '', context.message ? '말씀하신 조건을 기준으로 현재 공개 상품에서 찾았습니다' : '에코디가 현재 공개한 상품입니다')); article.append(why); const action = text('div', 'context-card-action', ''); action.append(text('small', '', item.dataset.status || '준비 상태 확인')); const link = document.createElement('a'); link.href = item.dataset.href || '#shop'; link.textContent = '상품 자세히'; action.append(link); article.append(action); results.append(article); });
    if (!cards.length) results.replaceChildren(text('article', 'context-loading', '현재 추천 가능한 상품을 준비하고 있습니다.'));
  }
  function render(context) {
    const picks = diversified(affiliateProducts, context, 4); summary.textContent = context.message ? `${contextLabel(context)} 기준으로 판매처를 가리지 않고 먼저 비교할 상품입니다.` : '현재 연결된 판매처를 섞어 오늘 먼저 볼 만한 상품을 보여드립니다.';
    if (!picks.length) return fallbackCards(context);
    results.replaceChildren(...picks.map((product, index) => card(product, context, index)));
  }
  async function load() {
    if (loading) return loading;
    loading = fetch(API, { method: 'GET', mode: 'cors', credentials: 'omit', headers: { accept: 'application/json' } }).then(async (response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); const body = await response.json(); const offers = Array.isArray(body.products) ? body.products.map(normalizeOffer).filter(Boolean) : []; const identities = Array.isArray(body.productIdentities) ? body.productIdentities.map(normalizeProductIdentity).filter(Boolean) : []; affiliateProducts = identities.length ? identities : groupOffers(offers); if (body.disclosureText && disclosure) disclosure.textContent = `${clean(body.disclosureText)} 추천순위는 제휴수수료와 분리합니다.`; return affiliateProducts; }).catch(() => { affiliateProducts = []; return []; });
    return loading;
  }
  async function recommend(message, focus = true) {
    const context = parse(message); if (focus) document.querySelector('#recommend')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    results.replaceChildren(text('article', 'context-loading', '현재 연결 상품과 판매처를 비교하고 있습니다.'));
    await load(); render(context); document.dispatchEvent(new CustomEvent('ekodi:context-recommend', { detail: { context: contextLabel(context), results: Math.min(4, affiliateProducts.length) } }));
  }
  form.addEventListener('submit', (event) => { event.preventDefault(); recommend(input.value); });
  document.addEventListener('click', (event) => { const button = event.target.closest('[data-context-prompt]'); if (!button) return; const prompt = clean(button.dataset.contextPrompt || button.textContent); input.value = prompt; recommend(prompt); });
  window.EkodiContextCurator = Object.freeze({ recommend });
  load().then(() => render(parse('')));
})();
