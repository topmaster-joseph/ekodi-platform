// 한글(.hwpx)·워드(.docx) 파일을 브라우저 편집용 HTML로 바꾼다. 프로그램 설치 없이 열어서 고치고 인쇄하기 위함.
// .hwpx/.docx는 ZIP 안의 XML이므로 Worker에서 압축을 풀고 문단·표·병합 칸만 옮긴다(글꼴·그림은 옮기지 않음).
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unent = (s) => String(s).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function readZip(buffer, wanted) {
  const bytes = new Uint8Array(buffer); const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1; for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('압축 파일 형식이 아닙니다.');
  const count = view.getUint16(eocd + 10, true); let p = view.getUint32(eocd + 16, true); const out = {};
  const dec = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= bytes.length; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true), size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true), extraLen = view.getUint16(p + 30, true), commentLen = view.getUint16(p + 32, true), local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (wanted(name)) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const raw = bytes.subarray(start, start + size);
      out[name] = dec.decode(method === 0 ? raw : method === 8 ? await inflateRaw(raw) : new Uint8Array());
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// XML → 문단·표. tags: p(문단) t(글자) tbl tr tc, 칸 병합은 cellSpan(hwpx)·gridSpan/vMerge(docx).
export function xmlToHtml(xml, kind) {
  const html = []; const tables = []; const paras = [];
  const curCell = () => { const t = tables[tables.length - 1]; const r = t?.rows[t.rows.length - 1]; return r?.[r.length - 1] || null; };
  const sink = (s) => { const c = curCell(); if (c) c.html.push(s); else html.push(s); };
  const re = /<(\/?)(?:[A-Za-z0-9]+:)?([A-Za-z]+)([^>]*?)(\/?)>|([^<]+)/g; let m;
  while ((m = re.exec(xml))) {
    if (m[5] !== undefined) { if (paras.length && paras[paras.length - 1].inText) paras[paras.length - 1].text += unent(m[5]); continue; }
    const close = m[1] === '/', tag = m[2], attrs = m[3] || '', selfClose = m[4] === '/';
    const attr = (k) => { const a = attrs.match(new RegExp(`(?:^|\\s)(?:[A-Za-z0-9]+:)?${k}="([^"]*)"`)); return a ? a[1] : ''; };
    if (tag === 'tbl') {
      if (!close) { const para = paras[paras.length - 1]; if (para && para.text.trim()) { sink(`<p>${esc(para.text)}</p>`); para.text = ''; } tables.push({ rows: [] }); }
      else { const t = tables.pop(); if (!t) continue; const body = t.rows.map(r => `<tr>${r.filter(c => !c.skip).map(c => `<td${c.colspan > 1 ? ` colspan="${c.colspan}"` : ''}${c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : ''}>${c.html.join('') || '<p></p>'}</td>`).join('')}</tr>`).join(''); sink(`<table class="auto">${body}</table>`); }
    } else if (tag === 'tr' && tables.length) { if (!close) tables[tables.length - 1].rows.push([]); }
    else if (tag === 'tc' && tables.length) { if (!close && !selfClose) { const t = tables[tables.length - 1]; t.rows[t.rows.length - 1]?.push({ html: [], colspan: 1, rowspan: 1 }); } }
    else if (tag === 'cellSpan' && kind === 'hwpx') { const c = curCell(); if (c) { c.colspan = Number(attr('colSpan')) || 1; c.rowspan = Number(attr('rowSpan')) || 1; } }
    else if (tag === 'gridSpan' && kind === 'docx') { const c = curCell(); if (c) c.colspan = Number(attr('val')) || 1; }
    else if (tag === 'vMerge' && kind === 'docx') {
      const c = curCell(); const t = tables[tables.length - 1]; if (!c || !t) continue;
      if (attr('val') === 'restart') c.vstart = true;
      else { // 위 칸과 이어진 칸: 같은 열의 시작 칸 rowspan을 늘리고 이 칸은 그리지 않는다.
        const row = t.rows[t.rows.length - 1]; const col = row.slice(0, -1).reduce((s, x) => s + x.colspan, 0);
        for (let r = t.rows.length - 2; r >= 0; r--) { let acc = 0; const above = t.rows[r].find(x => { const hit = acc === col; acc += x.colspan; return hit; }); if (above && !above.skip) { above.rowspan += 1; break; } }
        c.skip = true;
      }
    }
    else if (tag === 'p') {
      if (!close && !selfClose) paras.push({ text: '', inText: false });
      else if (selfClose) sink('<p></p>');
      else { const para = paras.pop(); if (para) sink(para.text.trim() ? `<p>${esc(para.text)}</p>` : (curCell() ? '' : '<p></p>')); }
    }
    else if (tag === 't') { const para = paras[paras.length - 1]; if (para) para.inText = !close && !selfClose; }
    else if ((tag === 'tab') && paras.length && !close) paras[paras.length - 1].text += '    ';
    else if ((tag === 'br' || tag === 'lineBreak') && paras.length && !close) paras[paras.length - 1].text += '\n';
  }
  return html.join('').replace(/(<p><\/p>){3,}/g, '<p></p><p></p>').replace(/\n/g, '<br>');
}

export async function officeFileToHtml(buffer, fileName) {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.hwpx')) {
    const files = await readZip(buffer, n => /^Contents\/section\d+\.xml$/i.test(n));
    const names = Object.keys(files).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    if (!names.length) throw new Error('한글 문서 본문을 찾지 못했습니다.');
    return names.map(n => xmlToHtml(files[n], 'hwpx')).join('<p class="pb"></p>');
  }
  if (lower.endsWith('.docx')) {
    const files = await readZip(buffer, n => n === 'word/document.xml');
    if (!files['word/document.xml']) throw new Error('워드 문서 본문을 찾지 못했습니다.');
    return xmlToHtml(files['word/document.xml'], 'docx');
  }
  if (lower.endsWith('.hwp')) throw new Error('옛 한글 형식(.hwp)은 아직 바로 열 수 없습니다. 한글에서 .hwpx로 저장하거나 담당자에게 변환을 요청해 주세요.');
  throw new Error('한글(.hwpx) 또는 워드(.docx) 파일만 올릴 수 있습니다.');
}
