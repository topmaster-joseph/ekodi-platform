// BOOKS-DETAIL-001 — 에코디서점 공통 도서 상세(표지·소개·목차·판본·가격·판매 상태·다른 언어판).
// 판매 가능 여부는 서버(books-sale-readiness.js)가 결정한다. 이 화면의 구매 버튼은 같은 규칙을 표시용으로만 따른다.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const base = location.pathname === '/books' || location.pathname.startsWith('/books/') ? '/books' : '';
  const under = p => { const v = String(p || ''); if (!base || !/^\/(?!\/)/.test(v) || v === base || v.startsWith(`${base}/`)) return v; return `${base}${v}`; };
  const READY = { manuscript: ['complete'], editing: ['complete'], epub: ['validated'], cover: ['complete'], metadata: ['ready'], storefront: ['live'] };
  const saleReady = b => Boolean(b && b.directSale?.enabled === true && String(b.directSale?.fileKey || '').trim() && String(b.edition || '').trim() && Math.trunc(Number(b.listPrice?.amount)) > 0 && Object.entries(READY).every(([k, v]) => v.includes(String(b.workflow?.[k] || ''))));
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const id = (new URLSearchParams(location.search).get('id') || '').toUpperCase();

  function row(label, value) { if (!value) return null; const d = el('div'); d.append(el('dt', '', label), el('dd', '', value)); return d; }
  function meta(name, content, prop) { const m = document.createElement('meta'); m.setAttribute(prop ? 'property' : 'name', name); m.content = content; document.head.append(m); }

  function render(book, catalog) {
    const isEn = String(book.language || '').toLowerCase() === 'en';
    document.title = `${book.title} | 에코디서점`;
    document.documentElement.lang = isEn ? 'en' : 'ko';
    const canonical = `https://ekodi.kr/books/book/?id=${encodeURIComponent(book.id)}`;
    const link = document.createElement('link'); link.rel = 'canonical'; link.href = canonical; document.head.append(link);
    meta('og:title', `${book.title} | 에코디서점`, true); meta('og:type', 'book', true); meta('og:url', canonical, true);
    if (book.coverImage) meta('og:image', `https://ekodi.kr/books${book.coverImage.replace(/^\/books/, '')}`, true);
    $('crumb').textContent = book.catalogNo || book.id;
    $('kicker').textContent = [book.series, book.seriesNumber ? String(book.seriesNumber).padStart(2, '0') : '', book.publicationType].filter(Boolean).join(' · ');
    $('title').textContent = book.title;
    $('subtitle').textContent = book.subtitle || '';
    $('byline').textContent = `${book.author}${isEn ? '' : ' 지음'} · 에코디서점`;
    $('abstract').textContent = book.abstract || book.subtitle || '';
    if (book.coverImage) { const img = el('img'); img.src = under(book.coverImage); img.alt = `${book.title} 표지`; img.width = 720; img.height = 1080; img.decoding = 'async'; $('cover').append(img); }
    else $('cover').append(el('div', 'cover-text', book.coverTitle || book.title));
    const price = Number(book.listPrice?.amount) > 0 ? book.listPrice.label || `${Number(book.listPrice.amount).toLocaleString('ko-KR')}원` : '가격 확정 전';
    const ident = book.identifiers?.isbnEbook || book.identifiers?.googleBooks || book.identifiers?.amazonAsin || '';
    for (const r of [row('저자', book.author), row('출판', '에코디서점'), row('시리즈', book.series ? `${book.series}${book.seriesNumber ? ' · ' + book.seriesNumber : ''}` : ''), row('카탈로그', book.catalogNo),
      row('판본', book.edition || '판본 확정 전'), row('형식', (book.format || []).join(' · ')), row('언어', book.languageLabel || book.language), row('가격', price), row('판매 상태', book.status), row('식별자', ident)]) if (r) $('info').append(r);
    const actions = $('actions');
    if (saleReady(book)) { const a = el('a', 'action-link', `${price} · 에코디서점에서 구매하기`); a.href = under(`/buy/?book=${encodeURIComponent(book.id)}`); actions.append(a); }
    else if (book.directSale?.enabled) actions.append(el('span', 'action-muted', '에코디서점 · 출간 준비 중'));
    for (const [label, url] of [['유페이퍼', book.links?.upaper], ['Google Play', book.links?.google], ['Amazon', book.links?.amazon]]) {
      if (!url) continue; const a = el('a', 'action-link', `${label} ↗`); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; actions.append(a);
    }
    const siblings = (catalog.books || []).filter(b => b.id !== book.id && book.workId && b.workId === book.workId && b.language && b.language !== book.language);
    if (siblings.length) {
      const note = $('languageNote'); note.hidden = false;
      note.append('다른 언어판: ');
      siblings.forEach((s, i) => { const a = el('a', '', s.title); a.href = under(s.detailUrl || `/book/?id=${s.id}`); if (i) note.append(' · '); note.append(a); });
      note.append(' — 한 언어판을 보유하시면 다른 언어판을 50% 할인된 금액으로 구입하실 수 있습니다.');
    }
    const toc = Array.isArray(book.toc) ? book.toc : [];
    $('tocBand').hidden = false;
    if (toc.length) {
      for (const item of toc) $('toc').append(el('li', /^(\d+부|Part \d+)/.test(item) ? 'part' : '', item));
      $('tocSource').textContent = book.tocSource ? `출처: ${book.tocSource}` : '';
    } else $('tocSource').textContent = '목차는 출간 확정 후 공개됩니다.';
    const ld = { '@context': 'https://schema.org', '@type': 'Book', name: book.title, author: { '@type': 'Person', name: book.author }, inLanguage: book.language || 'ko', bookFormat: 'https://schema.org/EBook', url: canonical, description: book.abstract || undefined, image: book.coverImage ? `https://ekodi.kr/books${book.coverImage.replace(/^\/books/, '')}` : undefined, isbn: book.identifiers?.isbnEbook || undefined, offers: saleReady(book) ? { '@type': 'Offer', price: String(book.listPrice.amount), priceCurrency: 'KRW', availability: 'https://schema.org/InStock', url: `https://ekodi.kr/books/buy/?book=${book.id}` } : undefined };
    const s = document.createElement('script'); s.type = 'application/ld+json'; s.textContent = JSON.stringify(ld); document.head.append(s);
    $('bookRoot').hidden = false;
  }

  fetch(under('/books.json'), { cache: 'no-store' }).then(r => r.json()).then(catalog => {
    const book = (catalog.books || []).find(b => b.id === id);
    if (!book) { $('title').textContent = '도서를 찾을 수 없습니다'; $('missing').hidden = false; return; }
    render(book, catalog);
  }).catch(() => { $('title').textContent = '도서 정보를 불러오지 못했습니다'; $('missing').hidden = false; });
})();
