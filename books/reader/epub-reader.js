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
      const href = a.getAttribute('href');
      if (/^https?:|^mailto:/i.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      else a.dataset.internal = resolve(ch.href, href);
    }
    const wrap = document.createElement('article');
    wrap.className = 'epub-chapter';
    wrap.innerHTML = new XMLSerializer().serializeToString(body).replace(/^<body[^>]*>|<\/body>$/g, '');
    return wrap;
  }

  const UI_CSS = `:host{all:initial;position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#faf7f0;color:#222;font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif}
  .bar{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #e3dccd;background:#fff}
  .bar .t{flex:1 1 30%;min-width:64px;font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bar button,.bar select{font:inherit;font-size:13px;border:1px solid #cfc6b4;background:#fff;border-radius:8px;padding:7px 10px;cursor:pointer}
  .bar select{flex:0 1 auto;min-width:0;max-width:38vw}
  @media(max-width:480px){.bar{flex-wrap:wrap}.bar .t{flex-basis:100%;order:-1}.bar select{flex:1 1 40%;max-width:none}}
  .page{flex:1;overflow:auto;-webkit-overflow-scrolling:touch}
  .page .inner{max-width:680px;margin:0 auto;padding:28px 22px 80px;font-family:"Noto Serif KR",serif;line-height:1.85;word-break:keep-all}
  .page img{max-width:100%;height:auto}
  .foot{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid #e3dccd;background:#fff;font-size:12px;color:#6b6257}
  .foot button{font:inherit;font-size:14px;border:1px solid #14305f;color:#14305f;background:#fff;border-radius:10px;padding:9px 16px;cursor:pointer}
  .foot button:disabled{opacity:.35;cursor:default}
  .notice{padding:6px 14px;background:#fff8e6;border-bottom:1px solid #f0e2b8;font-size:12px;color:#7a5a12}`;

  /** Open a full-screen reader. options: { title, storageKey, notice } */
  async function open(buffer, options = {}) {
    const book = await openBook(buffer);
    if (!book.chapters.length) throw new Error('읽을 수 있는 본문이 없습니다.');
    const host = document.createElement('div');
    host.setAttribute('role', 'dialog'); host.setAttribute('aria-modal', 'true'); host.setAttribute('aria-label', `${options.title || book.title} 읽기`);
    const root = host.attachShadow({ mode: 'open' });
    const key = options.storageKey ? `ekodi-reader:${options.storageKey}` : '';
    let state = { i: 0, size: 100 };
    try { if (key) state = { ...state, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch {}
    root.innerHTML = `<style>${UI_CSS}</style><style class="book">${book.css}</style>
      <div class="bar"><button class="close" aria-label="닫기">✕ 닫기</button><span class="t"></span><select class="toc" aria-label="목차"></select>
      <button class="smaller" aria-label="글자 작게">가−</button><button class="larger" aria-label="글자 크게">가+</button></div>
      ${options.notice ? `<div class="notice"></div>` : ''}
      <div class="page" tabindex="0"><div class="inner"></div></div>
      <div class="foot"><button class="prev">← 이전</button><span class="pos"></span><button class="next">다음 →</button></div>`;
    const $ = s => root.querySelector(s);
    $('.t').textContent = options.title || book.title;
    if (options.notice) $('.notice').textContent = options.notice;
    book.chapters.forEach((c, i) => { const o = document.createElement('option'); o.value = i; o.textContent = c.label || `${i + 1}`; $('.toc').append(o); });
    const save = () => { try { if (key) localStorage.setItem(key, JSON.stringify(state)); } catch {} };
    async function go(i, hash) {
      state.i = Math.max(0, Math.min(book.chapters.length - 1, i));
      const node = await chapterNode(book, book.chapters[state.i]);
      $('.inner').replaceChildren(node);
      $('.inner').style.fontSize = `${state.size}%`;
      $('.toc').value = String(state.i);
      $('.pos').textContent = `${state.i + 1} / ${book.chapters.length}`;
      $('.prev').disabled = state.i === 0; $('.next').disabled = state.i === book.chapters.length - 1;
      $('.page').scrollTop = 0;
      if (hash) node.querySelector(`[id="${CSS.escape(hash)}"]`)?.scrollIntoView();
      save();
    }
    $('.inner').addEventListener('click', e => {
      const a = e.target.closest('a[data-internal]'); if (!a) return;
      e.preventDefault();
      const [path, hash] = a.getAttribute('href').split('#');
      const target = book.chapters.findIndex(c => c.href === a.dataset.internal);
      if (target >= 0) go(target, hash);
    });
    $('.prev').onclick = () => go(state.i - 1);
    $('.next').onclick = () => go(state.i + 1);
    $('.toc').onchange = e => go(Number(e.target.value));
    $('.smaller').onclick = () => { state.size = Math.max(80, state.size - 10); $('.inner').style.fontSize = `${state.size}%`; save(); };
    $('.larger').onclick = () => { state.size = Math.min(180, state.size + 10); $('.inner').style.fontSize = `${state.size}%`; save(); };
    const close = () => { document.removeEventListener('keydown', onKey); host.remove(); document.body.style.overflow = ''; };
    const onKey = e => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') go(state.i + 1); else if (e.key === 'ArrowLeft') go(state.i - 1); };
    $('.close').onclick = close;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    document.body.append(host);
    await go(state.i);
    $('.page').focus();
    return { close, book };
  }

  window.EkodiEpubReader = { open, openBook, unzip };
})();
