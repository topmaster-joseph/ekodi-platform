(() => {
  'use strict';

  const API = 'https://api.ekodi.kr/api/affiliate/public/products?storefront=ekodi-mall&limit=100';
  const DEFAULT_DISCLOSURE = '쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';
  const SORT_LABELS = {
    registered: '등록순',
    popular: '인기순',
    'price-asc': '가격 낮은순',
    'price-desc': '가격 높은순',
  };
  const state = { products: [], category: '전체', query: '', sort: 'registered', status: 'loading', dialogProductId: '' };
  const grid = document.querySelector('#productGrid');
  const empty = document.querySelector('#emptyState');
  const categories = document.querySelector('#categoryBar');
  const search = document.querySelector('#productSearch');
  const sort = document.querySelector('#productSort');
  const statusNode = document.querySelector('#catalogStatus');
  const dialog = document.querySelector('#productDialog');
  const dialogClose = document.querySelector('#productDialogClose');
  const dialogImage = document.querySelector('#productDialogImage');
  const dialogPlaceholder = document.querySelector('#productDialogPlaceholder');
  const dialogCategory = document.querySelector('#productDialogCategory');
  const dialogTitle = document.querySelector('#productDialogTitle');
  const dialogPrice = document.querySelector('#productDialogPrice');
  const dialogBadges = document.querySelector('#productDialogBadges');
  const dialogBuy = document.querySelector('#productDialogBuy');
  const imageCache = new Map();

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' ? url.toString() : '';
    } catch { return ''; }
  }

  function normalize(product, popularityRank = 0) {
    const clickUrl = safeUrl(product?.clickUrl);
    if (!clickUrl) return null;
    const price = Number(product?.priceKrw || 0);
    const selectedAt = String(product?.selectedAt || '').trim();
    return {
      id: String(product?.id || ''),
      productId: String(product?.productId || ''),
      productName: String(product?.productName || '상품').trim().slice(0, 240),
      priceKrw: Number.isFinite(price) && price > 0 ? Math.trunc(price) : 0,
      imageUrl: safeUrl(product?.imageUrl),
      clickUrl,
      category: String(product?.category || '추천').trim().slice(0, 60) || '추천',
      isRocket: Boolean(product?.isRocket),
      isFreeShipping: Boolean(product?.isFreeShipping),
      selectedAt,
      popularityRank: Number.isInteger(popularityRank) ? popularityRank : 0,
    };
  }

  function formatPrice(value) {
    const amount = Number(value || 0);
    return amount > 0 ? `${new Intl.NumberFormat('ko-KR').format(amount)}원` : '가격 확인';
  }

  function timestamp(value) {
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(reader.error || new Error('IMAGE_READ_FAILED'));
      reader.readAsDataURL(blob);
    });
  }

  async function resolveImage(url) {
    if (!url) return '';
    if (imageCache.has(url)) return imageCache.get(url);
    const promise = fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const type = String(response.headers.get('content-type') || '').toLowerCase();
        if (!type.startsWith('image/')) throw new Error('NOT_IMAGE');
        return response.blob();
      })
      .then(blobToDataUrl)
      .catch(() => '');
    imageCache.set(url, promise);
    return promise;
  }

  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      hydrateImage(entry.target);
    }
  }, { rootMargin: '180px 0px' }) : null;

  async function hydrateImage(img) {
    if (!img || img.dataset.loaded === '1') return;
    img.dataset.loaded = '1';
    const source = img.dataset.source || '';
    const dataUrl = await resolveImage(source);
    if (!dataUrl || !img.isConnected) return;
    img.src = dataUrl;
    img.classList.add('loaded');
  }

  function queueImage(img) {
    if (!img?.dataset.source) return;
    if (observer) observer.observe(img);
    else hydrateImage(img);
  }

  function makeBadge(text, light = false) {
    const badge = document.createElement('span');
    badge.className = `badge${light ? ' light' : ''}`;
    badge.textContent = text;
    return badge;
  }

  function renderDialogBadges(product) {
    if (!dialogBadges) return;
    const items = [];
    if (product.isRocket) items.push(makeBadge('로켓'));
    if (product.isFreeShipping) items.push(makeBadge('무료배송', true));
    dialogBadges.replaceChildren(...items);
  }

  async function openProductDialog(product) {
    if (!dialog || !product) return;
    state.dialogProductId = product.id;
    if (dialogCategory) dialogCategory.textContent = product.category;
    if (dialogTitle) dialogTitle.textContent = product.productName;
    if (dialogPrice) dialogPrice.textContent = formatPrice(product.priceKrw);
    if (dialogBuy) dialogBuy.href = product.clickUrl;
    renderDialogBadges(product);
    if (dialogImage) {
      dialogImage.alt = product.productName;
      dialogImage.removeAttribute('src');
    }
    if (dialogPlaceholder) dialogPlaceholder.hidden = false;
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    const dataUrl = await resolveImage(product.imageUrl);
    if (!dataUrl || state.dialogProductId !== product.id || !dialog.open || !dialogImage) return;
    dialogImage.src = dataUrl;
    if (dialogPlaceholder) dialogPlaceholder.hidden = true;
  }

  function closeProductDialog() {
    state.dialogProductId = '';
    if (dialog?.open) dialog.close();
  }

  function makeCard(product) {
    const article = document.createElement('article');
    article.className = 'product-card';

    const media = document.createElement('button');
    media.type = 'button';
    media.className = 'product-media product-media-trigger';
    media.setAttribute('aria-label', `${product.productName} 상품 정보 보기`);
    media.addEventListener('click', () => openProductDialog(product));
    const image = document.createElement('img');
    image.alt = product.productName;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.dataset.source = product.imageUrl;
    const placeholder = document.createElement('span');
    placeholder.className = 'product-placeholder';
    placeholder.textContent = 'EKODI MALL';
    const badges = document.createElement('div');
    badges.className = 'badge-row';
    if (product.isRocket) badges.append(makeBadge('로켓'));
    if (product.isFreeShipping) badges.append(makeBadge('무료배송', true));
    media.append(image, placeholder, badges);

    const body = document.createElement('div');
    body.className = 'product-body';
    const category = document.createElement('p');
    category.className = 'product-category';
    category.textContent = product.category;
    const title = document.createElement('h3');
    title.textContent = product.productName;
    const price = document.createElement('p');
    price.className = 'product-price';
    price.textContent = formatPrice(product.priceKrw);
    const detail = document.createElement('button');
    detail.type = 'button';
    detail.className = 'detail-button';
    detail.textContent = '상품정보 보기';
    detail.addEventListener('click', () => openProductDialog(product));
    body.append(category, title, price, detail);
    article.append(media, body);
    queueMicrotask(() => queueImage(image));
    return article;
  }

  function sortProducts(products) {
    const list = [...products];
    const fallback = (a, b) => a.popularityRank - b.popularityRank;
    if (state.sort === 'popular') return list.sort(fallback);
    if (state.sort === 'price-asc') {
      return list.sort((a, b) => {
        if (!a.priceKrw && !b.priceKrw) return fallback(a, b);
        if (!a.priceKrw) return 1;
        if (!b.priceKrw) return -1;
        return a.priceKrw - b.priceKrw || fallback(a, b);
      });
    }
    if (state.sort === 'price-desc') {
      return list.sort((a, b) => {
        if (!a.priceKrw && !b.priceKrw) return fallback(a, b);
        if (!a.priceKrw) return 1;
        if (!b.priceKrw) return -1;
        return b.priceKrw - a.priceKrw || fallback(a, b);
      });
    }
    return list.sort((a, b) => timestamp(b.selectedAt) - timestamp(a.selectedAt) || Number(b.id || 0) - Number(a.id || 0) || fallback(a, b));
  }

  function filteredProducts() {
    const query = state.query.toLocaleLowerCase('ko-KR');
    const filtered = state.products.filter(product => {
      const categoryMatch = state.category === '전체' || product.category === state.category;
      const text = `${product.productName} ${product.category}`.toLocaleLowerCase('ko-KR');
      return categoryMatch && (!query || text.includes(query));
    });
    return sortProducts(filtered);
  }

  function renderProducts() {
    const products = filteredProducts();
    grid.replaceChildren(...products.map(makeCard));
    empty.hidden = products.length > 0;
    if (!state.products.length) {
      statusNode.textContent = state.status === 'loading' ? '상품을 불러오고 있습니다.' : '';
    } else {
      statusNode.textContent = `${products.length}개 상품 · ${SORT_LABELS[state.sort] || '등록순'}`;
    }
  }

  function renderCategories() {
    const list = ['전체', ...new Set(state.products.map(product => product.category))];
    const buttons = list.map(name => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      button.classList.toggle('active', name === state.category);
      button.addEventListener('click', () => {
        state.category = name;
        renderCategories();
        renderProducts();
      });
      return button;
    });
    categories.replaceChildren(...buttons);
  }

  function setDisclosure(text) {
    const disclosure = String(text || DEFAULT_DISCLOSURE).trim() || DEFAULT_DISCLOSURE;
    const node = document.querySelector('#disclosureText');
    if (node) node.textContent = disclosure;
  }

  async function loadProducts() {
    state.status = 'loading';
    renderProducts();
    try {
      const response = await fetch(API, { method: 'GET', mode: 'cors', credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      state.products = Array.isArray(data.products) ? data.products.map(normalize).filter(Boolean) : [];
      state.status = state.products.length ? 'ready' : 'preparing';
      setDisclosure(data.disclosureText);
    } catch (error) {
      console.warn('EKODI Mall product catalog unavailable', error);
      state.products = [];
      state.status = 'preparing';
      setDisclosure(DEFAULT_DISCLOSURE);
    }
    renderCategories();
    renderProducts();
  }

  search?.addEventListener('input', event => {
    state.query = String(event.currentTarget.value || '').trim();
    renderProducts();
  });

  sort?.addEventListener('change', event => {
    const value = String(event.currentTarget.value || 'registered');
    state.sort = Object.hasOwn(SORT_LABELS, value) ? value : 'registered';
    renderProducts();
  });

  dialogClose?.addEventListener('click', closeProductDialog);
  dialog?.addEventListener('click', event => {
    if (event.target === dialog) closeProductDialog();
  });
  dialog?.addEventListener('close', () => {
    state.dialogProductId = '';
    if (dialogImage) dialogImage.removeAttribute('src');
    if (dialogPlaceholder) dialogPlaceholder.hidden = false;
  });

  const giftForm=document.querySelector('#giftAiForm');
  const giftInput=document.querySelector('#giftAiInput');
  const giftConversation=document.querySelector('#giftAiConversation');
  const giftResults=document.querySelector('#giftAiResults');
  const giftStatus=document.querySelector('#giftAiStatus');
  const giftQuick=document.querySelector('#giftAiQuick');
  let giftContext={};
  const GIFT_OCCASIONS=[['추석',['추석','한가위']],['설날',['설날','설 선물','구정']],['어버이날',['어버이날']],['스승의날',['스승의날','스승의 날']],['생일',['생일']],['집들이',['집들이']],['결혼',['결혼','웨딩']],['출산',['출산','아기']],['승진',['승진']],['퇴직',['퇴직','은퇴']],['개업',['개업','오픈']],['입학·졸업',['입학','졸업']],['감사',['감사','답례']]];
  const GIFT_RECIPIENTS=[['교회 어르신',['장로님','권사님','목사님','교회 어르신']],['부모님',['부모님','부모','어머니','아버지','엄마','아빠']],['어르신',['어르신','시니어']],['은사·선생님',['은사','선생님','교수님','교수','스승']],['거래처',['거래처','협력사','협력업체','파트너사']],['고객',['고객','회원','단골']],['직원',['직원','임직원','사원','팀원']],['친구',['친구','지인']],['연인·배우자',['연인','남편','아내','배우자']],['아이·학생',['아이','어린이','학생','청소년']]];
  const GIFT_PREFS=['건강','건강식품','실용','가성비','고급','프리미엄','특별','흔하지','전통','지역','친환경','소포장','대량','빠른배송','무료배송','먹거리','생활용품'];
  const GIFT_EXPAND={건강:['건강','홍삼','견과','차','꿀','영양','비타민'],건강식품:['건강','홍삼','견과','차','꿀','영양','비타민'],실용:['생활','주방','세트','용품'],가성비:['세트','실속','묶음'],고급:['프리미엄','고급','한우','과일','선물세트'],프리미엄:['프리미엄','고급','한우','과일','선물세트'],특별:['수제','한정','프리미엄','전통','특산'],전통:['한과','약과','전통','차','꿀'],지역:['특산','지역','로컬','산지'],친환경:['친환경','유기농','오가닉','재사용'],먹거리:['식품','과일','견과','한과','차','꿀','고기'],생활용품:['생활','리빙','주방','용품']};
  function giftMapped(text,table){const lower=String(text||'').toLocaleLowerCase('ko-KR');for(const [label,terms] of table){if(terms.some(term=>lower.includes(term.toLocaleLowerCase('ko-KR'))))return label}return''}
  function giftMoney(text){const values=[];const regex=/(\d+(?:\.\d+)?)\s*(만원|천원|원)/g;let match;while((match=regex.exec(String(text||'')))){const unit=match[2]==='만원'?10000:match[2]==='천원'?1000:1;values.push(Math.round(Number(match[1])*unit))}if(!values.length)return{};const ranged=/(?:~|〜|부터|에서|\-|–)/.test(text)&&values.length>1;return{budgetMin:ranged?Math.min(...values):undefined,budgetMax:Math.max(...values)}}
  function giftQuantity(text){const m=String(text||'').match(/(\d{1,4})\s*(명|분|개|세트|곳|업체)/);return m?Number(m[1]):undefined}
  function giftAge(text){const d=String(text||'').match(/(\d{2})\s*대/);if(d)return`${d[1]}대`;const a=String(text||'').match(/(\d{1,3})\s*세/);return a?`${a[1]}세`:''}
  function giftAvoid(text){return[...String(text||'').matchAll(/([0-9A-Za-z가-힣]{1,20})\s*(?:말고|제외|빼고)/g)].map(m=>m[1]).filter(Boolean)}
  function parseGiftContext(message,previous={}){const text=String(message||'').replace(/\s+/g,' ').trim();const lower=text.toLocaleLowerCase('ko-KR');const money=giftMoney(text);const occasion=giftMapped(text,GIFT_OCCASIONS);const recipient=giftMapped(text,GIFT_RECIPIENTS);const age=giftAge(text);const quantity=giftQuantity(text);const preferences=GIFT_PREFS.filter(term=>lower.includes(term.toLocaleLowerCase('ko-KR')));return{...previous,...(occasion?{occasion}:{}),...(recipient?{recipient}:{}),...(age?{age}:{}),...(money.budgetMin?{budgetMin:money.budgetMin}:{}),...(money.budgetMax?{budgetMax:money.budgetMax}:{}),...(quantity?{quantity}:{}),preferences:[...new Set([...(previous.preferences||[]),...preferences])],avoid:[...new Set([...(previous.avoid||[]),...giftAvoid(text)])],lastMessage:text}}
  function giftTokens(context){const expanded=[];for(const pref of context.preferences||[])expanded.push(...(GIFT_EXPAND[pref]||[pref]));if(context.age&&/^(?:6|7|8|9)\d대$/.test(context.age))expanded.push('건강','실용');if(context.occasion)expanded.push('선물','세트');if(context.recipient==='거래처'||context.recipient==='은사·선생님')expanded.push('선물','세트','프리미엄');return[...new Set(expanded.map(term=>String(term).toLocaleLowerCase('ko-KR')))].filter(Boolean)}
  function giftText(product){return`${product.productName||''} ${product.category||''}`.toLocaleLowerCase('ko-KR')}
  function giftScore(product,context){const text=giftText(product);let score=14-Math.min(8,Number(product.popularityRank||0)*.08);score+=giftTokens(context).reduce((sum,term)=>sum+(text.includes(term)?9:0),0);if(/(선물|세트|과일|한우|견과|차|꿀|홍삼|건강|생활|주방)/.test(text))score+=9;const price=Number(product.priceKrw||0);if(context.budgetMax&&price){if(price<=context.budgetMax&&(!context.budgetMin||price>=context.budgetMin))score+=28;else if(price<=context.budgetMax)score+=22;else if(price<=context.budgetMax*1.1)score+=2;else if(price<=context.budgetMax*1.25)score-=15;else score-=40}if(product.isFreeShipping)score+=5;if(product.isRocket)score+=4;if((context.avoid||[]).some(term=>text.includes(String(term).toLocaleLowerCase('ko-KR'))))score-=140;return Math.round(score*10)/10}
  function giftValueScore(product,context){const price=Number(product.priceKrw||0);let score=giftScore(product,context);if(context.budgetMax&&price&&price<=context.budgetMax)score+=18;if(product.isFreeShipping)score+=10;if(price)score+=Math.max(0,16-price/10000);return score}
  function giftSpecialScore(product,context){const text=giftText(product);let score=giftScore(product,context);if(/(프리미엄|수제|한정|특산|전통|유기농|오가닉|한우|과일|한과|선물세트)/.test(text))score+=24;if((context.preferences||[]).some(term=>['특별','고급','프리미엄','전통','지역'].includes(term)))score+=8;return score}
  function giftReasons(product,context){const reasons=[];const price=Number(product.priceKrw||0);const text=giftText(product);if(context.budgetMax&&price&&price<=context.budgetMax)reasons.push('말씀하신 예산 안에 들어옵니다');if(giftTokens(context).some(term=>text.includes(term)))reasons.push('요청하신 선물 맥락과 관련성이 있습니다');if(product.isFreeShipping)reasons.push('무료배송 표시가 있습니다');if(product.isRocket)reasons.push('빠른 배송 표시가 있습니다');if(/(선물|세트|프리미엄|한우|과일|견과|차|꿀|홍삼)/.test(text))reasons.push('선물로 구성하기 좋은 상품군입니다');if(!reasons.length)reasons.push('현재 연결 상품 중 가격과 활용도의 균형이 좋습니다');return reasons.slice(0,3)}
  function giftSummary(context){const parts=[];if(context.occasion)parts.push(context.occasion);if(context.recipient)parts.push(context.recipient);if(context.age)parts.push(context.age);if(context.budgetMax)parts.push(`최대 ${new Intl.NumberFormat('ko-KR').format(context.budgetMax)}원`);if(context.quantity)parts.push(`${context.quantity}명/개 기준`);if(context.preferences?.length)parts.push(context.preferences.slice(-3).join('·'));if(context.avoid?.length)parts.push(`${context.avoid.slice(-2).join('·')} 제외`);return parts.join(' · ')||'현재 연결 상품 기준'}
  function pickGiftRecommendations(context){const scored=state.products.map(product=>({product,score:giftScore(product,context)})).filter(item=>item.score>-80).sort((a,b)=>b.score-a.score);if(!scored.length)return[];const result=[];const use=(entry,label)=>{if(!entry||result.some(item=>item.product.id===entry.product.id))return;result.push({...entry,label})};use(scored[0],'가장 적합');use([...scored].sort((a,b)=>giftValueScore(b.product,context)-giftValueScore(a.product,context)).find(entry=>!result.some(item=>item.product.id===entry.product.id)),'가성비');use([...scored].sort((a,b)=>giftSpecialScore(b.product,context)-giftSpecialScore(a.product,context)).find(entry=>!result.some(item=>item.product.id===entry.product.id)),'조금 특별한 선택');for(const entry of scored){if(result.length>=3)break;use(entry,'대안')}return result}
  function giftEscape(value){return String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]))}
  function addGiftBubble(role,text){if(!giftConversation)return;const bubble=document.createElement('div');bubble.className=`gift-ai-bubble ${role}`;bubble.textContent=text;giftConversation.appendChild(bubble);giftConversation.scrollTop=giftConversation.scrollHeight}
  function giftFollowUps(context){const prompts=[];if(!context.budgetMax)prompts.push('5만원 이하로 다시 골라줘');if(!context.recipient)prompts.push('부모님께 드릴 선물로 좁혀줘');if(!(context.preferences||[]).includes('건강'))prompts.push('건강 중심으로 바꿔줘');if(!(context.preferences||[]).some(term=>['고급','프리미엄'].includes(term)))prompts.push('조금 더 고급스럽게');if(!(context.preferences||[]).includes('가성비'))prompts.push('가성비 좋은 것으로 다시 골라줘');return prompts.slice(0,3)}
  function renderGiftRecommendations(context,recommendations){if(!giftResults)return;if(!recommendations.length){giftResults.innerHTML='<div class="gift-ai-empty">현재 연결된 상품 중 조건에 맞는 후보를 찾지 못했습니다. 예산이나 품목 조건을 조금 넓혀 다시 말씀해 주세요.</div>';return}const cards=recommendations.map(({product,label})=>`<article class="gift-ai-card"><span class="gift-ai-label">${giftEscape(label)}</span><p class="gift-ai-category">${giftEscape(product.category||'추천')}</p><h3>${giftEscape(product.productName)}</h3><p class="gift-ai-price">${giftEscape(formatPrice(product.priceKrw))}</p><ul class="gift-ai-reasons">${giftReasons(product,context).map(reason=>`<li>${giftEscape(reason)}</li>`).join('')}</ul><button class="gift-ai-product" type="button" data-product-id="${giftEscape(product.id)}" data-product-name="${giftEscape(product.productName)}">상품정보 보기</button></article>`).join('');const followups=giftFollowUps(context).map(prompt=>`<button type="button" data-gift-followup="${giftEscape(prompt)}">${giftEscape(prompt)}</button>`).join('');const disclosure=document.querySelector('#disclosureText')?.textContent||DEFAULT_DISCLOSURE;giftResults.innerHTML=`<div class="gift-ai-context">${giftEscape(giftSummary(context))}</div><div class="gift-ai-grid">${cards}</div><div class="gift-ai-followups">${followups}</div><p class="gift-ai-disclosure">${giftEscape(disclosure)} 추천순위는 제휴수수료가 아니라 현재 상품정보와 요청 맥락을 기준으로 산정합니다.</p>`}
  async function askGift(message){const text=String(message||'').trim();if(!text)return;addGiftBubble('user',text);if(giftInput)giftInput.value='';const submit=giftForm?.querySelector('button[type="submit"]');if(submit)submit.disabled=true;if(giftInput)giftInput.disabled=true;if(giftStatus)giftStatus.textContent='현재 연결된 상품과 말씀하신 조건을 함께 살펴보고 있습니다…';try{await catalogReady;giftContext=parseGiftContext(text,giftContext);const recommendations=pickGiftRecommendations(giftContext);const summary=giftSummary(giftContext);const names=recommendations.map(item=>item.product.productName).join(', ');addGiftBubble('assistant',recommendations.length?`${summary} 기준으로 현재 구매 가능한 연결 상품을 다시 비교했습니다. ${names} 순으로 먼저 살펴보시는 것이 좋겠습니다.`:`${summary} 조건에서는 현재 연결된 상품 중 적합한 후보가 부족합니다. 조건을 조금 바꿔 다시 찾아보겠습니다.`);renderGiftRecommendations(giftContext,recommendations);document.dispatchEvent(new CustomEvent('ekodi:gift-query',{detail:{contextSummary:summary,recommendationCount:recommendations.length}}))}catch(error){console.warn('EKODI Gift AI unavailable',error);addGiftBubble('assistant','상품망을 불러오지 못했습니다. 일반 상품 목록을 확인하시거나 잠시 뒤 다시 요청해 주세요.')}finally{if(submit)submit.disabled=false;if(giftInput){giftInput.disabled=false;giftInput.focus()}if(giftStatus)giftStatus.textContent='앞에서 말씀하신 조건을 이어서 반영합니다.'}}
  giftForm?.addEventListener('submit',event=>{event.preventDefault();askGift(giftInput?.value||'')});
  giftQuick?.addEventListener('click',event=>{const button=event.target.closest('[data-gift-prompt]');if(button)askGift(button.dataset.giftPrompt||button.textContent)});
  giftResults?.addEventListener('click',event=>{const followup=event.target.closest('[data-gift-followup]');if(followup){askGift(followup.dataset.giftFollowup||followup.textContent);return}const button=event.target.closest('.gift-ai-product');if(!button)return;const product=state.products.find(item=>String(item.id)===String(button.dataset.productId||''));if(product)openProductDialog(product)});

  const catalogReady = loadProducts();
})();
