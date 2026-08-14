(() => {
  const API = 'https://mall-api.ekodi.kr';
  const grid = document.querySelector('#grid');
  if (!grid) return;

  const text = (value) => String(value || '').trim();
  const price = (value) => Number.isFinite(Number(value)) ? `${new Intl.NumberFormat('ko-KR').format(Number(value))}원` : '가격 확정 전';
  const category = (value) => ['local','living','book','gift'].includes(value) ? value : 'local';
  function node(tag, className = '', value = '') { const element = document.createElement(tag); if (className) element.className = className; if (value) element.textContent = value; return element; }

  function productCard(item) {
    const id = `server:${item.shareCode}`;
    const href = item.publicUrl || `/p/${encodeURIComponent(item.shareCode)}`;
    const p = item.product || {}; const seller = item.seller || {}; const store = item.store || null;
    const article = node('article', 'card');
    article.dataset.product = id;
    article.dataset.serverProduct = item.shareCode;
    article.dataset.category = category(p.category);
    article.dataset.name = text(p.name) || '상품';
    article.dataset.status = '공개';
    article.dataset.href = href;
    article.dataset.search = `${text(p.name)} ${text(p.oneLine)} ${text(p.audience)} ${text(seller.displayName)} ${text(store?.name)} 개인상품`.toLowerCase();

    const thumb = node('div', `thumb ${category(p.category)}`);
    thumb.append(node('span', 'badge', store ? 'STORE PRODUCT' : 'PERSONAL PRODUCT'));
    const heart = node('button', 'heart', '♡'); heart.type = 'button'; heart.dataset.wish = id; heart.setAttribute('aria-label', `${article.dataset.name} 관심상품`); heart.setAttribute('aria-pressed', 'false'); thumb.append(heart);

    const body = node('div', 'card-body');
    body.append(node('p', 'store-kicker', store ? `${store.name} · ${seller.displayName}` : `개인상품 · ${seller.displayName || '판매자'}`));
    const h3 = node('h3'); const title = node('a', '', article.dataset.name); title.href = href; h3.append(title); body.append(h3);
    body.append(node('p', '', text(p.oneLine) || text(p.audience) || '판매자가 등록한 공개 상품입니다.'));
    const meta = node('div', 'meta'); meta.append(node('span', 'status', `${price(p.price)} · Mall 8%`));
    const detail = node('a', 'smallbtn', '자세히'); detail.href = href; meta.append(detail); body.append(meta);
    article.append(thumb, body);
    return article;
  }

  async function load() {
    try {
      const response = await fetch(`${API}/api/public/products?limit=24`, { headers: { accept: 'application/json' } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      const items = Array.isArray(body.products) ? body.products : [];
      for (const item of items) {
        if (!item?.shareCode || grid.querySelector(`[data-server-product="${CSS.escape(item.shareCode)}"]`)) continue;
        grid.append(productCard(item));
      }
      window.dispatchEvent(new CustomEvent('ekodi:marketplace-products-loaded', { detail: { count: items.length } }));
    } catch {
      window.dispatchEvent(new CustomEvent('ekodi:marketplace-products-loaded', { detail: { count: 0, degraded: true } }));
    }
  }
  load();
})();