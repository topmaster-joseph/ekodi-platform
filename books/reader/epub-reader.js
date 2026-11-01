// BOOKS-READER-001 — 에코디서점 브라우저 전자책 리더 (외부 라이브러리 없음)
// EPUB(zip)을 브라우저의 DecompressionStream('deflate-raw')으로 풀고, spine 순서대로 장을 렌더링한다.
// 책 내용은 shadow DOM 안에 정화(sanitize)해서 넣는다: script·iframe·form·이벤트 속성·javascript: 링크 제거.
// 이미지는 data: URL로 바꿔 넣으므로 CSP(img-src data:)를 그대로 지킨다.
(() => {
  'use strict';
  const td = new TextDecoder('utf-8');
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

  async function inflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** Minimal ZIP reader (central directory; stored + deflate). */
  async function unzip(buffer) {
    const b = new Uint8Array(buffer);
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('EPUB 파일 형식을 읽을 수 없습니다.');
    const count = u16(b, eocd + 10);
    let p = u32(b, eocd + 16);
    const entries = new Map();
    for (let n = 0; n < count; n++) {
      if (u32(b, p) !== 0x02014b50) throw new Error('EPUB 목차가 손상되었습니다.');
      const method = u16(b, p + 10), csize = u32(b, p + 20), nlen = u16(b, p + 28), xlen = u16(b, p + 30), clen = u16(b, p + 32), off = u32(b, p + 42);
      const name = td.decode(b.subarray(p + 46, p + 46 + nlen));
      entries.set(name, { method, csize, off });
      p += 46 + nlen + xlen + clen;
    }
    return {
      names: [...entries.keys()],
      async bytes(name) {
        const e = entries.get(name);
        if (!e) return null;
        const start = e.off + 30 + u16(b, e.off + 26) + u16(b, e.off + 28);
        const data = b.subarray(start, start + e.csize);
        if (e.method === 0) return data;
        if (e.method === 8) return inflate(data);
        throw new Error('지원하지 않는 압축 방식입니다.');
      },
      async text(name) { const x = await this.bytes(name); return x ? td.decode(x) : null; },
    };
  }

  // The /books gateway prefixes JS string literals that start with a slash, so the path separator
  // must never appear as a bare string literal in this file.
  const SEP = String.fromCharCode(47);
  const resolve = (base, href) => {
    const parts = (base.includes(SEP) ? base.slice(0, base.lastIndexOf(SEP) + 1) : '').concat(href.split('#')[0]).split(SEP);
    const out = [];
    for (const s of parts) { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); }
    return decodeURIComponent(out.join(SEP));
  };
  const mimeOf = name => ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' })[name.split('.').pop().toLowerCase()] || 'application/octet-stream';
  const toDataUrl = (bytes, mime) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return `data:${mime};base64,${btoa(s)}`; };

  /** Parse the package: spine order, labels from nav (or fall back to <title>). */
  async function openBook(buffer) {
    const zip = await unzip(buffer);
    const container = await zip.text('META-INF/container.xml');
    const opfPath = (container && /full-path="([^"]+)"/.exec(container)?.[1]) || zip.names.find(n => n.endsWith('.opf'));
    const opf = new DOMParser().parseFromString(await zip.text(opfPath), 'application/xml');
    const items = new Map([...opf.getElementsByTagName('item')].map(i => [i.getAttribute('id'), { href: resolve(opfPath, i.getAttribute('href')), type: i.getAttribute('media-type'), props: i.getAttribute('properties') || '' }]));
    const spine = [...opf.getElementsByTagName('itemref')].map(r => items.get(r.getAttribute('idref'))).filter(i => i && /xhtml|html/.test(i.type));
    const title = opf.getElementsByTagName('dc:title')[0]?.textContent || opf.getElementsByTagNameNS('*', 'title')[0]?.textContent || '';
    const navItem = [...items.values()].find(i => i.props.split(/\s+/).includes('nav'));
    const labels = new Map();
    if (navItem) {
      const nav = new DOMParser().parseFromString(await zip.text(navItem.href), 'application/xhtml+xml');
      const toc = [...nav.querySelectorAll('nav')].find(n => (n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || n.getAttribute('epub:type')) === 'toc') || nav.querySelector('nav');
      for (const a of toc ? toc.querySelectorAll('a[href]') : []) labels.set(resolve(navItem.href, a.getAttribute('href')), a.textContent.trim());
    }
    const css = (await Promise.all([...items.values()].filter(i => i.type === 'text/css').map(i => zip.text(i.href)))).join('\n')
      .replace(/@import[^;]+;/g, '').replace(/url\([^)]*\)/g, 'none');
    const chapters = [];
    for (const i of spine) {
      let label = labels.get(i.href) || '';
      if (!label) { const x = await zip.text(i.href); label = (/<title>([^<]*)<\/title>/i.exec(x || '')?.[1] || '').trim(); }
      chapters.push({ href: i.href, label });
    }
    return { zip, title, css, chapters };
  }

  const BLOCKED = 'script,iframe,object,embed,form,input,button,textarea,select,link,meta,base,frame,frameset';
  async function chapterNode(book, ch) {
    const doc = new DOMParser().parseFromString(await book.zip.text(ch.href), 'application/xhtml+xml');
    const body = doc.querySelector('body') || doc.documentElement;
    body.querySelectorAll(BLOCKED).forEach(n => n.remove());
    for (const el of body.querySelectorAll('*')) {
      for (const at of [...el.attributes]) {
        const v = at.value.trim().toLowerCase();
        if (at.name.startsWith('on') || ((at.name === 'href' || at.name.endsWith(':href') || at.name === 'src') && v.startsWith('javascript:'))) el.removeAttribute(at.name);
      }
    }
    for (const img of body.querySelectorAll('img[src], image')) {
      const attr = img.hasAttribute('src') ? 'src' : [...img.attributes].find(a => a.name.endsWith('href'))?.name;
      const src = attr && img.getAttribute(attr);
      if (!src || /^data:/.test(src)) continue;
      const path = resolve(ch.href, src);
      const bytes = await book.zip.bytes(path);
      if (bytes) img.setAttribute(attr, toDataUrl(bytes, mimeOf(path))); else img.removeAttribute(attr);
    }
    for (const a of body.querySelectorAll('a[href]')) {
      // 원고 변환 과정에서 생긴 'https\\://' 같은 이스케이프를 바로잡는다(내용은 바꾸지 않고 주소 표기만).
      const fixed = a.getAttribute('href').replace(/^(https?|mailto)\\+:/i, '$1:');
      a.setAttribute('href', fixed);
      for (const t of a.childNodes) if (t.nodeType === 3) t.nodeValue = t.nodeValue.replace(/^(\s*https?)\\+:/i, '$1:');
      const href = fixed;
      if (/^https?:|^mailto:/i.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      else a.dataset.internal = resolve(ch.href, href);
    }
    const wrap = document.createElement('article');
    wrap.className = 'epub-chapter';
    wrap.innerHTML = new XMLSerializer().serializeToString(body).replace(/^<body[^>]*>|<\/body>$/g, '');
    return wrap;
  }

  // BOOKS-READER-002: 책장을 넘기는 리더. 장(chapter)을 쪽 단위로 나누고(CSS 다단), 넘길 때 종이가 접히듯 돌아간다.
  // 상단·하단 막대는 본문 폭에 맞춰 가운데 정렬한다.
  const UI_CSS = `:host{all:initial;position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:radial-gradient(ellipse at center,#efe7d6 0%,#ddd2bc 100%);color:#222;font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif}
  .bar,.foot{background:rgba(255,255,255,.92);backdrop-filter:blur(6px)}
  .bar{border-bottom:1px solid #e3dccd}.foot{border-top:1px solid #e3dccd}
  .row{box-sizing:border-box;width:100%;max-width:var(--book-w);margin:0 auto;display:flex;align-items:center;gap:8px;padding:10px 14px}
  .bar .t{flex:1 1 30%;min-width:64px;font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bar button,.bar select{font:inherit;font-size:13px;border:1px solid #cfc6b4;background:#fff;border-radius:8px;padding:7px 10px;cursor:pointer}
  .bar select{flex:0 1 auto;min-width:0;max-width:38vw}
  @media(max-width:480px){.bar .row{flex-wrap:wrap}.bar .t{flex-basis:100%;order:-1}.bar select{flex:1 1 40%;max-width:none}}
  .notice{box-sizing:border-box;width:100%;max-width:var(--book-w);margin:0 auto;padding:6px 14px;font-size:12px;color:#7a5a12}
  .noticewrap{background:#fff8e6;border-bottom:1px solid #f0e2b8}
  .stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:18px 12px;perspective:2200px;overflow:hidden;touch-action:pan-y}
  .book{position:relative;width:100%;max-width:var(--book-w);height:100%;max-height:1100px}
  .cover{position:absolute;inset:-9px -12px -12px -10px;border-radius:6px 12px 12px 6px;background:linear-gradient(90deg,#3b1f12 0,#5a3020 3%,#6b3a26 50%,#5a3020 97%,#3b1f12 100%);box-shadow:0 24px 50px rgba(40,20,5,.45),inset 0 0 0 2px rgba(255,220,170,.08)}
  .cover.spread{border-radius:8px}
  .stack{position:absolute;inset:0;border-radius:3px 8px 8px 3px;background:#efe5cf;box-shadow:1px 1px 0 #e2d6bb,2px 2px 0 #f3ead6,3px 3px 0 #ddd0b2,4px 4px 0 #f1e7d1,5px 5px 0 #d8caa9,6px 6px 2px rgba(0,0,0,.18)}
  .stack.spread{box-shadow:1px 1px 0 #e2d6bb,-1px 1px 0 #e2d6bb,2px 2px 0 #f3ead6,-2px 2px 0 #f3ead6,3px 3px 0 #ddd0b2,-3px 3px 0 #ddd0b2,4px 4px 0 #f1e7d1,-4px 4px 0 #f1e7d1,5px 5px 2px rgba(0,0,0,.2),-5px 5px 2px rgba(0,0,0,.2)}
  .sheet{position:absolute;inset:0;border-radius:2px 7px 7px 2px;overflow:hidden;cursor:pointer;
    background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'%2F%3E%3CfeColorMatrix values='0 0 0 0 .45 0 0 0 0 .36 0 0 0 0 .22 0 0 0 .09 0'%2F%3E%3C%2Ffilter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'%2F%3E%3C%2Fsvg%3E"),linear-gradient(90deg,rgba(120,90,40,.28) 0,rgba(120,90,40,.08) 3.5%,rgba(0,0,0,0) 9%,rgba(0,0,0,0) 92%,rgba(120,90,40,.07) 100%),radial-gradient(ellipse at 60% 45%,#fdf9ef 0,#f8f0de 70%,#efe3c8 100%);
    box-shadow:inset 0 0 40px rgba(150,115,60,.12)}
  .sheet.spread{border-radius:2px;
    background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'%2F%3E%3CfeColorMatrix values='0 0 0 0 .45 0 0 0 0 .36 0 0 0 0 .22 0 0 0 .09 0'%2F%3E%3C%2Ffilter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'%2F%3E%3C%2Fsvg%3E"),linear-gradient(90deg,rgba(120,90,40,.10) 0,rgba(0,0,0,0) 6%,rgba(0,0,0,0) 40%,rgba(110,80,35,.12) 46%,rgba(70,50,20,.38) 50%,rgba(110,80,35,.12) 54%,rgba(0,0,0,0) 60%,rgba(0,0,0,0) 94%,rgba(120,90,40,.10) 100%),radial-gradient(ellipse at 50% 45%,#fdf9ef 0,#f8f0de 70%,#efe3c8 100%)}
  .sheet::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.18),rgba(0,0,0,0) 30%,rgba(0,0,0,0) 85%,rgba(120,90,40,.08))}
  .inner{color:#2a241b}
  .view{position:absolute;inset:34px 40px 40px 46px;overflow:hidden;outline:none}
  .inner{height:100%;column-fill:auto;column-gap:80px;font-family:"Noto Serif KR",serif;line-height:1.85;word-break:keep-all;transition:none;will-change:transform}
  .inner img{max-width:100%;max-height:calc(var(--page-h) - 20px);height:auto;object-fit:contain;break-inside:avoid}
  .inner h1,.inner h2,.inner h3{break-after:avoid}
  .folio{position:absolute;bottom:12px;left:0;right:0;text-align:center;font-size:11px;color:#9a8f7c;letter-spacing:.08em}
  .leaf{position:absolute;inset:0;z-index:3;pointer-events:none;backface-visibility:hidden;transform-style:preserve-3d}
  .leaf.fwd{transform-origin:left center;animation:fwd .62s cubic-bezier(.45,.05,.25,1) forwards}
  .leaf.back{transform-origin:right center;animation:back .62s cubic-bezier(.45,.05,.25,1) forwards}
  .leaf::after{content:"";position:absolute;inset:0;pointer-events:none;animation:shade .62s ease forwards}
  .leaf.fwd::after{background:linear-gradient(90deg,rgba(0,0,0,0),rgba(0,0,0,.28))}
  .leaf.back::after{background:linear-gradient(270deg,rgba(0,0,0,0),rgba(0,0,0,.28))}
  @keyframes fwd{to{transform:rotateY(-104deg);box-shadow:-30px 0 40px rgba(0,0,0,.18)}}
  @keyframes back{to{transform:rotateY(104deg);box-shadow:30px 0 40px rgba(0,0,0,.18)}}
  @keyframes shade{from{opacity:0}to{opacity:1}}
  @media(prefers-reduced-motion:reduce){.leaf{display:none}}
  @media(max-width:640px){.stage{padding:10px 8px}.view{inset:24px 22px 34px 26px}}
  .foot .row{justify-content:space-between;font-size:12px;color:#6b6257}
  .foot button{font:inherit;font-size:14px;border:1px solid #14305f;color:#14305f;background:#fff;border-radius:10px;padding:9px 16px;cursor:pointer}
  .foot button:disabled{opacity:.35;cursor:default}
  .pos{text-align:center}`;

  /** Open a full-screen reader. options: { title, storageKey, notice } */
  async function open(buffer, options = {}) {
    const book = await openBook(buffer);
    if (!book.chapters.length) throw new Error('읽을 수 있는 본문이 없습니다.');
    const host = document.createElement('div');
    host.setAttribute('role', 'dialog'); host.setAttribute('aria-modal', 'true'); host.setAttribute('aria-label', `${options.title || book.title} 읽기`);
    const root = host.attachShadow({ mode: 'open' });
    const key = options.storageKey ? `ekodi-reader:${options.storageKey}` : '';
    let state = { i: 0, size: 100, p: 0 };
    try { if (key) state = { ...state, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch {}
    root.innerHTML = `<style>${UI_CSS}</style><style class="bookcss">${book.css}</style>
      <div class="bar"><div class="row"><button class="close" aria-label="닫기">✕ 닫기</button><span class="t"></span><select class="toc" aria-label="목차"></select>
      <button class="smaller" aria-label="글자 작게">가−</button><button class="larger" aria-label="글자 크게">가+</button></div></div>
      ${options.notice ? `<div class="noticewrap"><div class="notice"></div></div>` : ''}
      <div class="stage"><div class="book"><div class="cover" aria-hidden="true"></div><div class="stack" aria-hidden="true"></div><div class="sheet" title="왼쪽을 누르면 앞 쪽, 오른쪽을 누르면 다음 쪽"><div class="view" tabindex="0"><div class="inner"></div></div><div class="folio"></div></div></div></div>
      <div class="foot"><div class="row"><button class="prev">← 이전</button><span class="pos" aria-live="polite"></span><button class="next">다음 →</button></div></div>`;
    const $ = s => root.querySelector(s);
    const stage = $('.stage'), bookEl = $('.book'), sheet = $('.sheet'), view = $('.view'), inner = $('.inner');
    $('.t').textContent = options.title || book.title;
    if (options.notice) $('.notice').textContent = options.notice;
    book.chapters.forEach((c, i) => { const o = document.createElement('option'); o.value = i; o.textContent = c.label || `${i + 1}`; $('.toc').append(o); });
    const save = () => { try { if (key) localStorage.setItem(key, JSON.stringify(state)); } catch {} };
    const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    let pages = 1, spread = false, busy = false;

    // 화면 크기에 맞춰 책 크기와 쪽 나누기를 다시 계산한다. 넓은 화면은 두 쪽 펼침.
    function layout() {
      spread = stage.clientWidth >= 1100;
      const w = spread ? Math.min(1240, stage.clientWidth - 24) : Math.min(760, stage.clientWidth - 16);
      host.style.setProperty('--book-w', `${w}px`);
      for (const n of [sheet, $('.cover'), $('.stack')]) n.classList.toggle('spread', spread);
      const vw = view.clientWidth, vh = view.clientHeight;
      host.style.setProperty('--page-h', `${vh}px`);
      inner.style.columnWidth = spread ? `${(vw - 80) / 2}px` : `${vw}px`;
      inner.style.columnCount = 'auto';
      inner.style.transform = 'translateX(0)';
      pages = Math.max(1, Math.round((inner.scrollWidth + 80) / (vw + 80)));
    }
    function place() {
      state.p = Math.max(0, Math.min(pages - 1, state.p));
      inner.style.transform = `translateX(${-(view.clientWidth + 80) * state.p}px)`;
      const last = state.i === book.chapters.length - 1 && state.p === pages - 1;
      $('.prev').disabled = state.i === 0 && state.p === 0; $('.next').disabled = last;
      $('.pos').textContent = `${state.i + 1} / ${book.chapters.length}장 · ${state.p + 1} / ${pages}쪽`;
      $('.folio').textContent = book.chapters[state.i].label || '';
      $('.toc').value = String(state.i);
      save();
    }
    async function load(i, at = 0, hash) {
      state.i = Math.max(0, Math.min(book.chapters.length - 1, i));
      const node = await chapterNode(book, book.chapters[state.i]);
      inner.replaceChildren(node);
      inner.style.fontSize = `${state.size}%`;
      layout();
      state.p = at === 'end' ? pages - 1 : at;
      if (hash) { const t = node.querySelector(`[id="${CSS.escape(hash)}"]`); if (t) state.p = Math.floor((t.getBoundingClientRect().left - inner.getBoundingClientRect().left) / (view.clientWidth + 80)); }
      place();
    }
    // 넘기는 동안 현재 쪽의 사본이 종이처럼 접히며 돌아가고, 그 아래에 새 쪽이 드러난다.
    async function turn(dir, change) {
      if (busy) return; busy = true;
      try {
        let leaf = null;
        if (!reduce()) { leaf = sheet.cloneNode(true); leaf.classList.add('leaf', dir > 0 ? 'fwd' : 'back'); bookEl.append(leaf); }
        await change();
        if (leaf) await new Promise(r => { leaf.addEventListener('animationend', r, { once: true }); setTimeout(r, 900); });
        leaf?.remove();
      } finally { busy = false; }
    }
    const next = () => {
      if (state.p < pages - 1) return turn(1, async () => { state.p++; place(); });
      if (state.i < book.chapters.length - 1) return turn(1, () => load(state.i + 1, 0));
    };
    const prev = () => {
      if (state.p > 0) return turn(-1, async () => { state.p--; place(); });
      if (state.i > 0) return turn(-1, () => load(state.i - 1, 'end'));
    };
    const go = (i, hash) => turn(i >= state.i ? 1 : -1, () => load(i, 0, hash));
    inner.addEventListener('click', e => {
      const a = e.target.closest('a[data-internal]'); if (!a) return;
      e.preventDefault();
      const hash = a.getAttribute('href').split('#')[1];
      const target = book.chapters.findIndex(c => c.href === a.dataset.internal);
      if (target >= 0) go(target, hash);
    });
    $('.prev').onclick = prev; $('.next').onclick = next;
    // 책장 어디든 누르면 넘긴다: 왼쪽 절반은 앞 쪽, 오른쪽 절반은 다음 쪽. 링크·글자 선택은 그대로 둔다.
    sheet.addEventListener('click', e => {
      if (e.target.closest('a[href]') || String(root.getSelection?.() || getSelection()).trim()) return;
      const r = sheet.getBoundingClientRect();
      (e.clientX - r.left < r.width / 2 ? prev : next)();
    });
    $('.toc').onchange = e => go(Number(e.target.value));
    const resize = (d) => { state.size = Math.max(80, Math.min(180, state.size + d)); const ratio = pages > 1 ? state.p / (pages - 1) : 0; inner.style.fontSize = `${state.size}%`; layout(); state.p = Math.round(ratio * (pages - 1)); place(); };
    $('.smaller').onclick = () => resize(-10);
    $('.larger').onclick = () => resize(10);
    // 손가락으로 밀어서 넘기기
    let sx = null, sy = 0;
    stage.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    stage.addEventListener('touchend', e => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null; if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) (dx < 0 ? next : prev)(); }, { passive: true });
    let rt = 0;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(() => { const ratio = pages > 1 ? state.p / (pages - 1) : 0; layout(); state.p = Math.round(ratio * (pages - 1)); place(); }, 120); };
    addEventListener('resize', onResize);
    const close = () => { document.removeEventListener('keydown', onKey); removeEventListener('resize', onResize); host.remove(); document.body.style.overflow = ''; };
    const onKey = e => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next(); } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); } };
    $('.close').onclick = close;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    host.style.setProperty('--book-w', '760px');
    document.body.append(host);
    await load(state.i, state.p || 0);
    view.focus();
    return { close, book, next, prev, go, get position() { return { chapter: state.i, page: state.p, pages }; } };
  }

  window.EkodiEpubReader = { open, openBook, unzip };
})();
