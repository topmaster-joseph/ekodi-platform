(() => {
  'use strict';
  const C = window.EkodiBooksCommerce;
  const $ = id => document.getElementById(id);
  async function download(item, button) {
    button.disabled = true; const label = button.textContent; button.textContent = '준비 중…';
    try {
      const s = await C.session();
      const r = await fetch(`${C.BASE}/api/commerce/download/${encodeURIComponent(item.id)}`, { headers: { authorization: 'Bearer ' + (s?.accessToken || '') }, cache: 'no-store' });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || '파일을 받지 못했습니다.'); }
      const blob = await r.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${item.title}.epub`; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { alert(e.message); }
    finally { button.disabled = false; button.textContent = label; }
  }
  async function load() {
    try {
      const data = await C.api('/library');
      $('libLogin').hidden = true;
      $('libStatus').textContent = `${data.email} · ${data.items.length}권`;
      const list = $('libraryList'); list.replaceChildren();
      if (!data.items.length) { const p = document.createElement('p'); p.innerHTML = '아직 구매한 책이 없습니다. '; const a = document.createElement('a'); a.href = C.BASE + '/#catalog'; a.textContent = '출판 목록 보기 →'; p.append(a); list.append(p); return; }
      for (const item of data.items) {
        const row = document.createElement('article'); row.className = 'library-item';
        const info = document.createElement('div'); const h = document.createElement('h3'); h.textContent = item.title; const p = document.createElement('p');
        p.textContent = `${item.author} · ${new Date(item.grantedAt).toLocaleDateString('ko-KR')} 구매`; info.append(h, p);
        const btn = document.createElement('button'); btn.type = 'button';
        btn.textContent = item.downloadReady ? 'EPUB 받기' : '파일 준비 중'; btn.disabled = !item.downloadReady;
        btn.addEventListener('click', () => download(item, btn));
        row.append(C.cover(item), info, btn); list.append(row);
      }
    } catch (e) {
      if (e.status === 401) { $('libStatus').textContent = '로그인이 필요합니다.'; $('libLogin').hidden = false; C.mountGoogle($('googleButton'), (t, err) => { $('accountStatus').textContent = t || ''; }, load); }
      else $('libStatus').textContent = e.message;
    }
  }
  load();
})();
