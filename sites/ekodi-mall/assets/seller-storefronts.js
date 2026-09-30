(() => {
  const API = 'https://mall-api.ekodi.kr';
  const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  if (!window.supabase) return;
  const sb = window.supabase.createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:false } });

  function article(kicker, title, description) {
    const node = document.createElement('article');
    const span = document.createElement('span');
    const h3 = document.createElement('h3');
    const p = document.createElement('p');
    span.textContent = kicker; h3.textContent = title; p.textContent = description;
    node.append(span,h3,p);
    return node;
  }

  function ensureSection() {
    let section = document.querySelector('#sellerStorefronts');
    if (section) return section;
    const analytics = document.querySelector('#sellerAnalytics');
    const readiness = document.querySelector('#commerceReadiness');
    const anchor = analytics || readiness || document.querySelector('#sellerAuth');
    if (!anchor) return null;
    section = document.createElement('section');
    section.id = 'sellerStorefronts';
    section.className = 'seller-modules';
    section.innerHTML = `<div class="heading"><div><p class="eyebrow">MY STOREFRONTS</p><h2>상품이 모이면<br>내 Store가 됩니다</h2><p>스토어를 선택한 상품을 게시하면 별도 공개 Storefront가 생깁니다. Storefront에서 상품을 탐색한 유입은 Mall 8% 경로이며, 상품별 Direct 링크는 기존 7% 규칙을 유지합니다.</p></div><button class="smallbtn" type="button" data-storefront-refresh>새로고침</button></div><div class="module-grid" data-storefront-grid><article><span>LOCKED</span><h3>Google 로그인 필요</h3><p>로그인하면 본인 Store만 표시합니다.</p></article></div><p class="studio-local-note">Storefront에는 게시된 상품만 노출되며 판매자 이메일, visitor ID, 구매자 개인정보는 공개하지 않습니다.</p>`;
    anchor.insertAdjacentElement('afterend', section);
    section.querySelector('[data-storefront-refresh]')?.addEventListener('click', loadStorefronts);
    return section;
  }

  async function token() { const { data } = await sb.auth.getSession(); return data.session?.access_token || ''; }
  async function api() {
    const accessToken = await token();
    if (!accessToken) throw new Error('Google 판매자 로그인이 필요합니다.');
    const response = await fetch(`${API}/api/storefronts`, { headers: { authorization:`Bearer ${accessToken}` } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Mall API ${response.status}`);
    return body.storefronts || [];
  }

  async function copy(value, button) {
    try { await navigator.clipboard.writeText(value); button.textContent='복사됨'; setTimeout(() => { button.textContent='Store URL 복사'; },1200); }
    catch { button.textContent='복사 실패'; }
  }

  function storeCard(store) {
    const node = article(store.publicEnabled ? 'PUBLIC STORE' : 'DRAFT STORE', store.name || store.slug, `게시 ${store.publishedCount}개 / 전체 ${store.productCount}개 · ${store.verificationStatus === 'verified' ? '검증 완료' : '검증 전'}`);
    const actions = document.createElement('div');
    actions.className='studio-buttons';
    if (store.publicEnabled) {
      const open = document.createElement('a'); open.className='smallbtn'; open.href=store.publicUrl; open.target='_blank'; open.rel='noopener'; open.textContent='Store 열기';
      const copyButton = document.createElement('button'); copyButton.className='smallbtn'; copyButton.type='button'; copyButton.textContent='Store URL 복사'; copyButton.addEventListener('click',() => copy(store.publicUrl,copyButton));
      actions.append(open,copyButton);
    } else {
      const note=document.createElement('span'); note.className='status'; note.textContent='상품을 1개 이상 게시하면 공개됩니다.'; actions.append(note);
    }
    node.append(actions);
    return node;
  }

  async function loadStorefronts() {
    const section=ensureSection(); if (!section) return;
    const grid=section.querySelector('[data-storefront-grid]');
    try {
      if (!(await token())) { grid.replaceChildren(article('LOCKED','Google 로그인 필요','로그인하면 본인 Store만 표시합니다.')); return; }
      grid.replaceChildren(article('LOADING','Store 확인 중...','Mall D1에서 본인 Store를 읽고 있습니다.'));
      const stores=await api();
      grid.replaceChildren();
      if (!stores.length) { grid.append(article('OPTIONAL','아직 Store가 없습니다','상품 등록에서 Store명과 slug를 선택하면 Store가 만들어집니다.')); return; }
      stores.forEach((store) => grid.append(storeCard(store)));
    } catch (error) { grid.replaceChildren(article('RETRY','Store를 불러오지 못했습니다',error.message)); }
  }

  ensureSection();
  sb.auth.onAuthStateChange(() => setTimeout(loadStorefronts,0));
  window.addEventListener('focus',loadStorefronts);
  loadStorefronts();
})();
