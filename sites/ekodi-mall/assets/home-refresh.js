/* Progressive enhancement: the existing marketplace filters, search and wishlist remain authoritative. */
(() => {
  const form = document.getElementById('mallGlobalSearch');
  const query = document.getElementById('mallGlobalQuery');
  const search = document.getElementById('search');
  const shop = document.getElementById('shop');
  const params = new URLSearchParams(window.location.search);
  const incomingQuery = (params.get('q') || '').trim().slice(0,120);
  if (search && incomingQuery) {
    search.value = incomingQuery;
    if (query) query.value = incomingQuery;
    search.dispatchEvent(new Event('input', { bubbles:true }));
    // Catalog grouping is handled by the dedicated read-only search section.
  }
  if (params.has('wishlist')) window.addEventListener('load', () => document.getElementById('wishBtn')?.click(), {once:true});

  form?.addEventListener('submit', (event) => {
    // Allow native GET form submission if this is not the Mall storefront.
    if (!search || !shop) return;
    event.preventDefault();
    const term = (query?.value || '').trim().slice(0, 120);
    if (!term) {
      // Clearing the search field is a real reset, never a replay of stale URL state.
      navigate('#shop', 'all');
      return;
    }
    const target = new URL(window.location.href);
    target.searchParams.delete('category');
    target.searchParams.set('q', term);
    target.hash = '#shop';
    window.history.pushState(null, '', target.pathname + target.search + target.hash);
    syncView();
    window.scrollTo({top:0,behavior:'auto'});
  });

  // The Mall is one page with two explicit detail views: catalog and AI recommendations.
  // A single canonical #grid is retained: no cloned cards, duplicate hearts or overlay panels.
  const nav = document.querySelector('.mall-primary-nav');
  const allTypes = new Set(['all','general','living','book','gift','local']);
  const filterButtons = [...document.querySelectorAll('#filters button[data-filter]')];
  let applyingRoute = false;
  const aiForm = document.getElementById('mallRecommendSearchForm');
  const aiInput = document.getElementById('mallRecommendSearchInput');
  const viewFromUrl = () => {
    const current = new URL(window.location.href);
    if (current.hash === '#recommend') return 'recommend';
    if (current.hash === '#shop' || current.searchParams.has('category') || current.searchParams.has('q')) return 'catalog';
    return 'home';
  };
  const catalogHeadings = {all:['ALL MARKET','전체상품','에코디몰의 상품을 한눈에 살펴보세요.'],local:['LOCAL MARKET','로컬·특산물','지역의 가치와 이야기를 담은 상품을 만나보세요.'],general:['FOOD & WELLNESS','식품·건강','먹거리와 건강한 일상을 위한 상품을 살펴보세요.'],living:['LIVING & TECH','생활·가전','일상의 편리함을 더하는 상품을 만나보세요.'],book:['BOOKS & LEARNING','책·배움','읽고 배우며 성장하는 상품을 살펴보세요.'],gift:['GIFTS','선물·기념품','마음을 전하는 선물과 기념품을 만나보세요.']};
  const categoryFromUrl = () => {
    const value = new URLSearchParams(window.location.search).get('category') || 'all';
    return allTypes.has(value) ? value : 'all';
  };
  function syncView() {
    const mode = viewFromUrl();
    document.body.dataset.mallView = mode;
    const category = categoryFromUrl();
    const term = new URLSearchParams(window.location.search).get('q')?.trim().slice(0,120) || '';
    document.body.dataset.mallSearch = mode === 'catalog' && term ? 'true' : 'false';
    const heading = shop?.querySelector('.heading');
    const copy = catalogHeadings[category] || catalogHeadings.all;
    const eyebrow = heading?.querySelector('.eyebrow');
    const title = heading?.querySelector('h2');
    const description = heading?.querySelector('div > p:not(.eyebrow)');
    if (eyebrow) eyebrow.textContent = copy[0];
    if (title) title.textContent = copy[1];
    if (description) description.textContent = copy[2];
    nav?.querySelectorAll('a[aria-current]').forEach(anchor => anchor.removeAttribute('aria-current'));
    if (mode === 'catalog') {
      const button = filterButtons.find(item => item.dataset.filter === category);
      if (button && !button.classList.contains('active')) {
        // Apply the selected filter without allowing its click handler to
        // clear the URL's active global search query.
        applyingRoute = true;
        try { button.click(); } finally { applyingRoute = false; }
      }
      nav?.querySelector(`a[data-filter-target="${category}"]`)?.setAttribute('aria-current', 'page');
    } else if (mode === 'recommend') {
      nav?.querySelector('a[href="#recommend"]')?.setAttribute('aria-current', 'page');
    }
    const urlSearch = new URLSearchParams(window.location.search).get('q') || '';
    if (query) query.value = urlSearch;
    if (aiInput && urlSearch) aiInput.value = urlSearch;
    if (search && search.value !== urlSearch) {
      search.value = urlSearch;
      search.dispatchEvent(new Event('input', { bubbles:true }));
    }
    window.dispatchEvent(new CustomEvent('ekodi:mall-route-change',{detail:{mode,category,q:term}}));
  }
  function navigate(hash, category, { keepSearch = false } = {}) {
    const next = new URL(window.location.href);
    next.hash = hash;
    next.searchParams.delete('category');
    if (!keepSearch) next.searchParams.delete('q');
    if (hash === '#shop' && category && category !== 'all' && allTypes.has(category)) next.searchParams.set('category', category);
    window.history.pushState(null, '', next.pathname + next.search + next.hash);
    syncView();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  // Category tabs and mobile shortcuts show ONLY their actual products, directly under the header.
  document.querySelectorAll('a[data-filter-target]').forEach(link => {
    link.addEventListener('click', event => {
      const category = link.getAttribute('data-filter-target');
      if (!allTypes.has(category)) return;
      event.preventDefault();
      navigate('#shop', category);
    });
  });
  // Home, product and AI links (including back/forward/direct URLs) share one route contract.
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || link.hasAttribute('data-filter-target')) return;
    const hash = link.getAttribute('href');
    if (!['#shop', '#recommend', '#top'].includes(hash)) return;
    event.preventDefault();
    navigate(hash, 'all', { keepSearch: hash === '#recommend' });
  });
  // Keep the selected filter deep-linkable, including /?category=book from the bookstore.
  filterButtons.forEach(button => button.addEventListener('click', () => {
    if (applyingRoute || document.body.dataset.mallView !== 'catalog') return;
    const next = new URL(window.location.href);
    next.searchParams.delete('category');
    next.searchParams.delete('q');
    if (button.dataset.filter !== 'all') next.searchParams.set('category', button.dataset.filter);
    next.hash = '#shop';
    window.history.replaceState(null, '', next.pathname + next.search + next.hash);
    nav?.querySelectorAll('a[aria-current]').forEach(anchor => anchor.removeAttribute('aria-current'));
    nav?.querySelector(`a[data-filter-target="${button.dataset.filter}"]`)?.setAttribute('aria-current','page');
    if(query) query.value='';
    if(search) {search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));}
    document.body.dataset.mallSearch='false';
    window.dispatchEvent(new CustomEvent('ekodi:mall-route-change',{detail:{mode:'catalog',category:button.dataset.filter,q:''}}));
  }));
  aiForm?.addEventListener('submit', event => {
    event.preventDefault();
    const term = (aiInput?.value || '').trim().slice(0,180);
    if (!term) { aiInput?.focus(); return; }
    const contextInput = document.getElementById('contextInput');
    if (contextInput) contextInput.value = term;
    window.EkodiContextCurator?.recommend(term, true);
  });
  window.addEventListener('popstate', syncView);
  window.addEventListener('hashchange', syncView);
  syncView();
})();

/* EKODI-MALL-UNIFIED-SEARCH-001
 * Read-only, grouped search across ready Mall products and approved affiliate catalog.
 * No checkout, automatic purchasing, user identity, or unverified listing is inferred. */
(() => {
  'use strict';
  const section = document.getElementById('mallSearchResults');
  const groupsHost = document.getElementById('mallSearchGroups');
  const status = document.getElementById('mallSearchStatus');
  const catalog = document.getElementById('grid');
  if (!section || !groupsHost || !status || !catalog) return;
  const headings = new Map([
    ['coupang','쿠팡제휴몰'], ['travel','여행·레저'], ['book','책·배움'],
    ['local','로컬·특산물'], ['general','식품·건강'],
    ['living','생활·가전'], ['gift','선물·기념품'], ['other','기타 제휴상품']
  ]);
  const clean = value => String(value ?? '').replace(/\s+/g,' ').trim();
  const safeUrl = (value, sameOrigin = false) => {
    try {
      const url = new URL(clean(value), window.location.origin);
      if (url.protocol !== 'https:' || url.username || url.password) return '';
      if (sameOrigin && url.origin !== window.location.origin) return '';
      return url.href;
    } catch { return ''; }
  };
  const mallDetailHref = value => {
    const raw=clean(value);
    // Static Pages uses /products/... within its own root while the production
    // Mall is mounted at /ekodimall/. Preserve absolute Core /p/ links.
    const canonical = /^\/products\//.test(raw) && window.location.pathname.startsWith('/ekodimall')
      ? '/ekodimall'+raw : raw;
    return safeUrl(canonical,true);
  };
  const price = amount => Number(amount) > 0 && Number.isFinite(Number(amount))
    ? new Intl.NumberFormat('ko-KR').format(Number(amount))+'원' : '가격은 판매처에서 확인';
  const tokensOf = input => clean(input).toLocaleLowerCase('ko-KR').split(/\s+/).filter(Boolean);
  const matches = (item, tokens) => tokens.every(token => item.search.includes(token));
  const element = (tag, cls, value) => {
    const node = document.createElement(tag); if (cls) node.className = cls;
    if (value !== undefined) node.textContent = value;
    return node;
  };
  const bucketOf = item => {
    if (clean(item?.regionIds)) return 'local';
    return headings.has(item?.category) ? item.category : 'general';
  };
  function localRows() {
    return [...catalog.querySelectorAll('[data-product]')]
      .filter(card => card.dataset.bookstoreQuotePending !== 'true')
      .map(card => {
      const name = clean(card.dataset.name || card.querySelector('h3')?.textContent);
      const href = mallDetailHref(card.dataset.href || card.querySelector('h3 a')?.href);
      const category = bucketOf(card.dataset);
      const summary = clean(card.querySelector('.card-summary')?.textContent);
      const displayedPrice = clean(card.querySelector('.meta .status')?.textContent).match(/\d[\d,]*원/)?.[0] || '';
      if (!name || !href) return null;
      return {key:'mall:'+href,category,name,summary,href,
        image:safeUrl(card.querySelector('.thumb img')?.src),
        shownPrice:displayedPrice,
        search:[name,summary,card.dataset.search,headings.get(category)].map(clean).join(' ').toLocaleLowerCase('ko-KR')};
    }).filter(Boolean);
  }
  function publicRow(raw) {
    // A static Books projection cannot bypass the live publisher quote gate.
    // Verified book cards enter through localRows after the quote succeeds.
    if (raw?.product?.source?.system === 'ekodi-bookstore') return null;
    if (!raw?.checkoutReady && !(raw?.product?.saleType === 'affiliate' && safeUrl(raw?.product?.affiliateUrl))) return null;
    const p = raw.product || {};
    const name = clean(p.name);
    const href = safeUrl(raw.publicUrl, true);
    const category = bucketOf({category:p.category,regionIds:(p.region?.regionIds || []).join(',')});
    if (!name || !href) return null;
    const summary = clean(p.oneLine || p.audience);
    return {key:'mall:'+href,category,name,summary,href,image:safeUrl(raw.image),
      shownPrice:Number(p.price)>0?price(p.price):'',
      search:[name,summary,clean(raw.store?.name),clean(raw.seller?.displayName),headings.get(category)].join(' ').toLocaleLowerCase('ko-KR')};
  }
  function affiliateRow(raw) {
    if (!safeUrl(raw?.clickUrl) || !clean(raw?.productName)) return null;
    const provider = clean(raw.merchantKey || raw.providerKey).toLowerCase().replace(/[^a-z0-9]/g,'');
    const category = ['coupang','coupangpartners'].includes(provider) ? 'coupang'
      : provider === 'agoda' ? 'travel' : 'other';
    const name = clean(raw.productName);
    const path = category === 'coupang' ? '/ekodimall/coupang/' : category === 'travel'
      ? '/ekodimall/travel/stay/' : '';
    const href = path ? safeUrl(path+'?q='+encodeURIComponent(name),true) : safeUrl(raw.clickUrl);
    return {key:'affiliate:'+clean(raw.id),category,name,summary:[raw.category,raw.brand].map(clean).filter(Boolean).join(' · '),
      href,image:safeUrl(raw.imageUrl),shownPrice:price(raw.priceKrw),
      search:[name,raw.category,raw.brand,raw.model,raw.providerName,headings.get(category)].map(clean).join(' ').toLocaleLowerCase('ko-KR')};
  }
  let generation=0;
  // EKODI-MALL-TIERED-SEARCH-001: Mall first, approved provider references
  // second, external comparisons third, assisted discovery fourth. A reference
  // is never relabeled as an EKODI checkout or automatically purchased.
  const stage = (number,label,description) => {
    const box=element('section','mall-search-stage');
    const title=element('h3','mall-search-stage-title',number+'차 · '+label);
    box.append(title,element('p','mall-search-stage-note',description));
    groupsHost.append(box);
    return box;
  };
  const officialLink = (parent,href,label,note) => {
    const card=element('div','mall-search-reference');
    const anchor=element('a','mall-search-reference-link',label);
    anchor.href=href;
    anchor.target='_blank';
    anchor.rel='noopener noreferrer';
    card.append(anchor,element('p','',note));
    parent.append(card);
  };
  function cardsFor(parent,rows) {
    const byCategory = new Map();
    for (const row of rows) {
      if(!byCategory.has(row.category))byCategory.set(row.category,[]);
      byCategory.get(row.category).push(row);
    }
    for (const [id,label] of headings) {
      const listRows=byCategory.get(id);
      if(!listRows?.length)continue;
      const block=element('div','mall-search-group');
      const header=element('h4','',label+' · '+listRows.length+'개');
      const list=element('div','mall-search-cards');
      for (const item of listRows.slice(0,12)) {
        const card=element('article','mall-search-card');
        const visual=element('a','mall-search-visual');
        visual.href=item.href;
        const affiliate=item.key.startsWith('affiliate:') || item.source==='affiliate';
        if(affiliate && !item.href.startsWith(window.location.origin)){visual.target='_blank';visual.rel='noopener sponsored';}
        if(item.image){
          const img=element('img');
          img.src=item.image;img.alt=item.name;img.loading='lazy';img.decoding='async';
          img.addEventListener('error',()=>visual.replaceChildren(element('span','','이미지 준비 중')),{once:true});
          visual.append(img);
        }else visual.append(element('span','','이미지 준비 중'));
        const body=element('div','mall-search-card-body');
        const h4=element('h5');
        const link=element('a','',item.name);link.href=item.href;
        if(affiliate && !item.href.startsWith(window.location.origin)){link.target='_blank';link.rel='noopener sponsored';}
        h4.append(link);body.append(h4);
        if(item.summary)body.append(element('p','',item.summary.slice(0,70)));
        if(item.shownPrice)body.append(element('p','mall-search-price',item.shownPrice));
        card.append(visual,body);list.append(card);
      }
      block.append(header,list);
      parent.append(block);
    }
  }
  function render(query,allRows,warnings=[],loading=false,supplier={state:'checking',items:[]}) {
    const tokens=tokensOf(query);
    const dedup=new Map();
    for(const item of allRows)if(item&&item.href&&matches(item,tokens))dedup.set(item.key,item);
    const mall=[],affiliates=[];
    for(const item of dedup.values()){
      if(item.key.startsWith('affiliate:')||item.source==='affiliate')affiliates.push(item);
      else mall.push(item);
    }
    const validSupplier=(Array.isArray(supplier.items)?supplier.items:[]).filter(item=>
      /^\d{4,15}$/.test(String(item.itemNo||'')) && clean(item.title) &&
      item.purchaseMode==='external-reference-only' &&
      item.url==='https://www.domeggook.com/'+item.itemNo);
    groupsHost.replaceChildren();

    const first=stage('1','에코디몰 자체상품','판매 승인과 실시간 도서 견적 검증을 통과한 등록상품을 먼저 보여드립니다.');
    if(mall.length)cardsFor(first,mall);
    else first.append(element('p','mall-search-stage-empty',loading?'에코디몰 상품을 확인하고 있습니다.':'현재 등록된 판매 가능 상품에 일치하는 결과가 없습니다.'));

    const second=stage('2','도매꾹·도매매 등 공급처','공식 공급처의 상품은 참고 조회이며, 에코디몰 자동구매나 결제 가능 상태를 뜻하지 않습니다.');
    if(validSupplier.length){
      const listing=element('div','mall-search-provider-results');
      for(const item of validSupplier){
        officialLink(listing,item.url,item.title,'공식 공급처에서 확인 · 최소주문수량 '+(item.minimumQuantity||'확인 필요')+' · 가격·배송비 별도 재검증');
      }
      second.append(listing);
    }else second.append(element('p','mall-search-stage-empty',
      loading||supplier.state==='checking'?'공급처 조회 가능 여부를 확인하고 있습니다.':
      supplier.state==='reference-only'?'검색어와 일치하는 승인 공개 공급처 상품이 없습니다.':
      supplier.state==='unavailable'?'공급처 조회에 실패했습니다. 상품이 없다는 뜻은 아닙니다.':
      '공급처 공개연동은 권한·호출한도 검증 후 열립니다. 아래 공식 검색을 이용할 수 있습니다.'));
    const providerUrl='https://www.domeggook.com/main/item/itemList.php?sw='+encodeURIComponent(query)+'&sf=ttl';
    officialLink(second,providerUrl,'도매꾹 공식 사이트에서 검색','외부 사이트의 주문·배송·결제는 해당 판매처 정책을 따릅니다.');

    const third=stage('3','제휴상품·외부 쇼핑 비교','에코디 제휴상품은 승인된 링크만 노출합니다. 외부 쇼핑은 비교 링크이며 가격·재고는 해당 사이트에서 확인합니다.');
    if(affiliates.length)cardsFor(third,affiliates);
    else third.append(element('p','mall-search-stage-empty',loading?'제휴상품 조회 중입니다.':'일치하는 승인 제휴상품이 없습니다.'));
    const comparisons=element('div','mall-search-compare-links');
    officialLink(comparisons,'https://search.shopping.naver.com/search/all?query='+encodeURIComponent(query),'네이버쇼핑에서 비교','외부 검색 결과 · 에코디몰 직접판매 아님');
    officialLink(comparisons,'https://www.google.com/search?tbm=shop&q='+encodeURIComponent(query),'구글쇼핑에서 비교','외부 검색 결과 · 에코디몰 직접판매 아님');
    third.append(comparisons);

    const fourth=stage('4','AI 대체상품·소싱 상담','검색 결과가 부족하면 용도·규격·예산을 입력해 유사 상품을 찾아보세요. 주문은 별도 확인이 필요합니다.');
    const ai=element('a','mall-search-ai-link','AI로 대체상품 찾기');
    ai.href='#recommend';fourth.append(ai);
    if(warnings.length)groupsHost.append(element('p','mall-search-stage-warning','일부 에코디몰·제휴 검색 연결을 확인하지 못했습니다. 조회 실패는 상품 없음으로 간주하지 않습니다.'));
    const total=mall.length+affiliates.length+validSupplier.length;
    status.textContent='“'+query+'” 검색 · 에코디몰 '+mall.length+'개 · 공급처 참조 '+validSupplier.length+'개 · 제휴 '+affiliates.length+'개'+(loading?' · 추가 조회 중':'')+(warnings.length?' · 일부 조회 실패':'');
  }
  async function affiliateRows() {
    const response=await fetch('/api/affiliate/public/products?storefront=ekodi-mall&limit=100',
      {method:'GET',credentials:'omit',cache:'no-store',headers:{accept:'application/json'},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('affiliate unavailable');
    const body=await response.json();
    return (Array.isArray(body.products)?body.products:[]).map(affiliateRow).filter(Boolean);
  }
  async function marketRows(version) {
    const rows=[];
    // Follow the public sale-only API's own pagination, never draft inventory.
    for(let offset=0;offset<2000;offset+=60) {
      if(version!==generation)return rows;
      const response=await fetch('/ekodimall/api/api/public/products?limit=60&offset='+offset,
        {method:'GET',credentials:'omit',cache:'no-store',headers:{accept:'application/json'},signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('marketplace unavailable');
      const body=await response.json();
      const page=Array.isArray(body.products)?body.products:[];
      rows.push(...page.map(publicRow).filter(Boolean));
      if(page.length<60)break;
    }
    return rows;
  }
  async function supplierRows(query) {
    const response=await fetch('/ekodimall/api/api/public/supplier/search?q='+encodeURIComponent(query),
      {method:'GET',credentials:'omit',cache:'no-store',headers:{accept:'application/json'},signal:AbortSignal.timeout(6500)});
    const body=await response.json().catch(()=>({state:'unavailable',items:[]}));
    if(!response.ok)throw Error('supplier unavailable');
    return body;
  }
  async function runSearch(query,version) {
    const local=localRows();
    render(query,local,[],true,{state:'checking',items:[]});
    const [market,affiliate,supplier]=await Promise.allSettled([marketRows(version),affiliateRows(),supplierRows(query)]);
    if(version!==generation)return;
    const warnings=[];
    if(market.status!=='fulfilled')warnings.push('market');
    if(affiliate.status!=='fulfilled')warnings.push('affiliate');
    render(query,[...local,...(market.status==='fulfilled'?market.value:[]),...(affiliate.status==='fulfilled'?affiliate.value:[])],
      warnings,false,supplier.status==='fulfilled'?supplier.value:{state:'unavailable',items:[]});
  }
  let lastQuery='';
  function onRoute(){
    const query=clean(new URLSearchParams(window.location.search).get('q')).slice(0,120);
    const active=document.body.dataset.mallSearch==='true' && !!query;
    const version=++generation;
    section.hidden=!active;
    if(!active){groupsHost.replaceChildren();lastQuery='';return;}
    lastQuery=query;
    void runSearch(query,version);
  }
  window.addEventListener('ekodi:mall-route-change',onRoute);
  window.addEventListener('ekodi:marketplace-products-loaded', () => {
    if (document.body.dataset.mallSearch === 'true') onRoute();
  });
  onRoute();
})();
