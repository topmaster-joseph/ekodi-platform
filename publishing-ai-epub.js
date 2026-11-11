// PUBLISHING-AI-EPUB-001 — 감수 완료된 AI 협업 원고 → EPUB 3 (외부 라이브러리 없음, 워커에서 바로 생성).
// 판권면에 'AI 협업 초안 · 저자 감수'를 반드시 넣는다. 삽화는 장 첫머리에 넣고 대체텍스트를 단다.

const enc = new TextEncoder();
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** Minimal ZIP (stored entries). The first entry must be the uncompressed EPUB mimetype. */
export function zipStore(files) {
  const parts = [], central = []; let offset = 0;
  for (const [name, data] of files) {
    const n = enc.encode(name), d = typeof data === 'string' ? enc.encode(data) : data, c = crc32(d);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(14, c, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, n.length, true);
    parts.push(new Uint8Array(h.buffer), n, d);
    const e = new DataView(new ArrayBuffer(46));
    e.setUint32(0, 0x02014b50, true); e.setUint16(4, 20, true); e.setUint16(6, 20, true); e.setUint16(8, 0x0800, true);
    e.setUint32(16, c, true); e.setUint32(20, d.length, true); e.setUint32(24, d.length, true); e.setUint16(28, n.length, true); e.setUint32(42, offset, true);
    central.push(new Uint8Array(e.buffer), n);
    offset += 30 + n.length + d.length;
  }
  const size = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** 원고 표기(### 소제목, > 강조, - 목록, 빈 줄 문단) → XHTML */
export function bodyToXhtml(text) {
  const out = []; let list = null;
  const flush = () => { if (list) { out.push(`<ul>${list.map(i => `<li>${i}</li>`).join('')}</ul>`); list = null; } };
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  for (const block of String(text || '').replace(/\r/g, '').split(/\n{2,}/)) {
    for (const raw of block.split('\n')) {
      const line = raw.trim(); if (!line) continue;
      if (/^#{1,6}\s/.test(line)) { flush(); out.push(`<h3>${inline(line.replace(/^#+\s*/, ''))}</h3>`); }
      else if (/^>\s?/.test(line)) { flush(); out.push(`<blockquote><p>${inline(line.replace(/^>\s?/, ''))}</p></blockquote>`); }
      else if (/^[-*•]\s/.test(line)) { (list ??= []).push(inline(line.replace(/^[-*•]\s/, ''))); }
      else { flush(); out.push(`<p>${inline(line)}</p>`); }
    }
    flush();
  }
  return out.join('\n');
}

const page = (title, body, lang) => `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}"><head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" href="style.css"/></head><body>${body}</body></html>`;
const CSS = `body{font-family:serif;line-height:1.8;margin:0 1em;word-break:keep-all}h1{font-size:1.6em;margin:2em 0 .3em}h2{font-size:1.3em;margin:1.5em 0 .8em}h3{font-size:1.1em;margin:1.6em 0 .6em}blockquote{margin:1.2em 0;padding:.4em 1em;border-left:3px solid #8a6d3b;font-weight:bold}figure{margin:1em 0;text-align:center}figure img{max-width:100%}.colophon{font-size:.85em;line-height:1.7}.title{text-align:center;margin-top:30%}.title .imprint{margin-top:40%;letter-spacing:.1em}figure img{border-radius:8px}`;

/** Build an EPUB 3. book: {id,title,subtitle,author,publisher,disclosure,lang,keywords,pitch}, chapters: [{number,title,body}], images: Map<number,{mime,b64}> */
export function buildEpub(book, chapters, images = new Map(), modified = new Date()) {
  const lang = book.lang || 'ko', id = `urn:uuid:${book.id}`, files = [['mimetype', 'application/epub+zip']];
  files.push(['META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>']);
  files.push(['OEBPS/style.css', CSS]);
  const manifest = ['<item id="css" href="style.css" media-type="text/css"/>', '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>', '<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>'];
  const spine = ['<itemref idref="title"/>'], toc = [];
  files.push(['OEBPS/title.xhtml', page(book.title, `<section class="title"><h1>${esc(book.title)}</h1>${book.subtitle ? `<p>${esc(book.subtitle)}</p>` : ''}<p>${esc(book.author)}</p><p class="imprint">에코디비즈[출판]</p></section>`, lang)]);
  for (const c of chapters) {
    const n = String(c.number).padStart(2, '0'), img = images.get(c.number);
    let fig = '';
    if (img?.b64) {
      const bytes = Uint8Array.from(atob(img.b64), ch => ch.charCodeAt(0));
      files.push([`OEBPS/img${n}.jpg`, bytes]); manifest.push(`<item id="img${n}" href="img${n}.jpg" media-type="image/jpeg"/>`);
      fig = `<figure><img src="img${n}.jpg" alt="${esc(c.title)} 삽화"/></figure>`;
    }
    files.push([`OEBPS/ch${n}.xhtml`, page(c.title, `<section epub:type="chapter"><h2>${esc(c.title)}</h2>${fig}${bodyToXhtml(c.body)}</section>`, lang)]);
    manifest.push(`<item id="ch${n}" href="ch${n}.xhtml" media-type="application/xhtml+xml"/>`); spine.push(`<itemref idref="ch${n}"/>`);
    toc.push(`<li><a href="ch${n}.xhtml">${esc(c.title)}</a></li>`);
  }
  const year = modified.getUTCFullYear();
  files.push(['OEBPS/colophon.xhtml', page('판권', `<section class="colophon" epub:type="copyright-page"><h2>판권</h2><p>${esc(book.title)}${book.subtitle ? ` — ${esc(book.subtitle)}` : ''}</p><p>지은이 ${esc(book.author)}</p><p>펴낸곳 ${esc(book.publisher)}</p><p>${esc(book.disclosure)}: 이 책의 초안은 AI와 협업해 작성했고, 저자가 모든 내용을 읽고 고쳐 감수했습니다. 삽화는 AI로 생성했습니다.</p><p>전자책 초판 ${year}</p><p>© ${year} ${esc(book.author)}. 이 책의 무단 전재와 복제를 금합니다.</p></section>`, lang)]);
  manifest.push('<item id="colophon" href="colophon.xhtml" media-type="application/xhtml+xml"/>'); spine.push('<itemref idref="colophon"/>');
  files.push(['OEBPS/nav.xhtml', page('차례', `<nav epub:type="toc" id="toc"><h2>차례</h2><ol>${toc.join('')}<li><a href="colophon.xhtml">판권</a></li></ol></nav>`, lang)]);
  const stamp = modified.toISOString().replace(/\.\d+Z$/, 'Z');
  files.push(['OEBPS/content.opf', `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${id}</dc:identifier><dc:title>${esc(book.title)}</dc:title><dc:creator>${esc(book.author)}</dc:creator><dc:publisher>${esc(book.publisher)}</dc:publisher><dc:language>${lang}</dc:language>${book.pitch ? `<dc:description>${esc(book.pitch)}</dc:description>` : ''}${(book.keywords || []).map(k => `<dc:subject>${esc(k)}</dc:subject>`).join('')}<meta property="dcterms:modified">${stamp}</meta></metadata><manifest>${manifest.join('')}</manifest><spine>${spine.join('')}</spine></package>`]);
  return zipStore(files);
}
