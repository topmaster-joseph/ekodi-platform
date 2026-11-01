(() => {
  'use strict';
  const C = window.EkodiBooksCommerce;
  const $ = id => document.getElementById(id);
  async function download(item, button, audioTrack = null) {
    button.disabled = true; const label = button.textContent; button.textContent = '준비 중…';
    try {
      const s = await C.session();
      const route = audioTrack ? `download/audio/${encodeURIComponent(item.id)}/${encodeURIComponent(audioTrack.number)}` : `download/${encodeURIComponent(item.id)}`;
      const r = await fetch(`${C.BASE}/api/commerce/${route}`, { headers: { authorization: 'Bearer ' + (s?.accessToken || '') }, cache: 'no-store' });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || '파일을 받지 못했습니다.'); }
      const blob = await r.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = audioTrack ? `${item.title}-${String(audioTrack.number).padStart(2,'0')}.mp3` : `${item.title}.epub`; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { alert(e.message); }
    finally { button.disabled = false; button.textContent = label; }
  }
  // BOOKS-READER-001: 구매한 책은 받지 않고도 바로 펼쳐 읽을 수 있다(같은 소유권 검증 다운로드 API 사용).
  async function fetchBook(route) {
    const s = await C.session();
    const r = await fetch(`${C.BASE}/api/commerce/${route}`, { headers: { authorization: 'Bearer ' + (s?.accessToken || '') }, cache: 'no-store' });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || '책을 열지 못했습니다.'); }
    return r.arrayBuffer();
  }
  async function read(item, button) {
    if (!window.EkodiEpubReader) { alert('리더를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'); return; }
    button.disabled = true; const label = button.textContent; button.textContent = '여는 중…';
    // BOOKS-READER-003: 무료 오디오북이 승인·공개된 책이면 리더에서 바로 듣고, 재생에 맞춰 책장이 넘어간다.
    const audio = item.audiobook?.included && item.audiobook?.ready && item.audiobook.tracks?.length ? {
      tracks: item.audiobook.tracks,
      async fetchTrack(track) {
        const s = await C.session();
        const r = await fetch(`${C.BASE}/api/commerce/download/audio/${encodeURIComponent(item.id)}/${encodeURIComponent(track.number)}`, { headers: { authorization: 'Bearer ' + (s?.accessToken || '') }, cache: 'no-store' });
        if (!r.ok) throw new Error('오디오를 불러오지 못했습니다.');
        return r.blob();
      },
    } : null;
    try { await window.EkodiEpubReader.open(await fetchBook(`download/${encodeURIComponent(item.id)}`), { title: item.title, storageKey: item.id, audio }); }
    catch (e) { alert(e.message); }
    finally { button.disabled = false; button.textContent = label; }
  }
  window.EkodiLibraryFetchBook = fetchBook;
  async function load() {
    try {
      const data = await C.api('library');
      $('libLogin').hidden = true;
      $('libStatus').textContent = `${data.email} · ${data.items.length}권`;
      const list = $('libraryList'); list.replaceChildren();
      if (!data.items.length) { const p = document.createElement('p'); p.innerHTML = '아직 구매한 책이 없습니다. '; const a = document.createElement('a'); a.href = `${C.BASE}/#catalog`; a.textContent = '출판 목록 보기 →'; p.append(a); list.append(p); return; }
      for (const item of data.items) {
        const row = document.createElement('article'); row.className = 'library-item';
        const info = document.createElement('div'); const h = document.createElement('h3'); h.textContent = item.title; const p = document.createElement('p');
        p.textContent = `${item.author} · ${new Date(item.grantedAt).toLocaleDateString('ko-KR')} 구매`; info.append(h, p);
        const btn = document.createElement('button'); btn.type = 'button';
        btn.textContent = item.downloadReady ? 'EPUB 받기' : '파일 준비 중'; btn.disabled = !item.downloadReady;
        btn.addEventListener('click', () => download(item, btn));
        const audioArea = document.createElement('div');
        audioArea.className = 'audio-bonus';
        if (item.audiobook?.included) {
          const status = document.createElement('p');
          status.textContent = item.audiobook.ready ? '구매 혜택 · 오디오북 무료 제공 (추가 결제 없음)' : '구매 혜택 · 오디오북 무료 제작·권리 검수 중 (추가 결제 없음)';
          audioArea.append(status);
          for (const track of item.audiobook.tracks || []) {
            if (!item.audiobook.ready) break;
            const audioButton = document.createElement('button');
            audioButton.type = 'button'; audioButton.textContent = `오디오북 ${track.number}장 · ${track.title} MP3 받기`;
            audioButton.addEventListener('click', () => download(item, audioButton, track));
            audioArea.append(audioButton);
          }
        }
        info.append(audioArea);
        const actions = document.createElement('div'); actions.className = 'library-actions';
        if (item.downloadReady) { const readBtn = document.createElement('button'); readBtn.type = 'button'; readBtn.className = 'read-btn'; readBtn.textContent = '펼쳐 읽기'; readBtn.addEventListener('click', () => read(item, readBtn)); actions.append(readBtn); }
        actions.append(btn);
        row.append(C.cover(item), info, actions); list.append(row);
      }
    } catch (e) {
      if (e.status === 401) { $('libStatus').textContent = '로그인이 필요합니다.'; $('libLogin').hidden = false; C.mountGoogle($('googleButton'), (t, err) => { $('accountStatus').textContent = t || ''; }, () => load().then(operatorPanel)); }
      else $('libStatus').textContent = e.message;
    }
  }
  // LIBRARY-OPERATOR-RENDER-001: page load, sign-in callback and post-upload refresh can overlap.
  // Each run builds off-screen and only the newest run replaces the list, so rows never duplicate.
  let operatorRun = 0;
  async function operatorPanel() {
    const run = ++operatorRun;
    let catalog;
    try { catalog = await (await fetch(`${C.BASE}/books.json`, { cache: 'no-store' })).json(); } catch { return; }
    const books = (catalog.books || []).filter(b => b.directSale?.enabled);
    const host = document.createDocumentFragment();
    for (const book of books) {
      let state;
      try { state = await C.api(`admin/files/${encodeURIComponent(book.id)}`); } catch (e) { if (e.status === 403 || e.status === 401) return; continue; }
      $('operatorPanel').hidden = false;
      const row = document.createElement('div'); row.className = 'op-row';
      const info = document.createElement('div'); const b = document.createElement('b'); b.textContent = book.title; const sm = document.createElement('small');
      sm.textContent = state.present ? `판매 파일 있음 · ${(state.size / 1024 / 1024).toFixed(2)}MB · ${new Date(state.uploaded).toLocaleString('ko-KR')}` : '판매 파일 없음 — EPUB를 올려 주세요';
      info.append(b, sm);
      const label = document.createElement('label'); label.textContent = state.present ? '새 판본 올리기' : 'EPUB 올리기';
      const input = document.createElement('input'); input.type = 'file'; input.accept = '.epub,application/epub+zip';
      input.addEventListener('change', async () => {
        const file = input.files?.[0]; if (!file) return;
        label.firstChild.textContent = '올리는 중…';
        try {
          const s = await C.session();
          const r = await fetch(`${C.BASE}/api/commerce/admin/files/${encodeURIComponent(book.id)}`, { method: 'PUT', headers: { authorization: 'Bearer ' + (s?.accessToken || ''), 'content-type': 'application/epub+zip' }, body: file });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error || '올리지 못했습니다.');
          alert(`${book.title} 판매 파일을 올렸습니다.`); operatorPanel(); load();
        } catch (e) { alert(e.message); label.firstChild.textContent = '다시 올리기'; }
      });
      label.append(input); row.append(info, label);
      const review = document.createElement('a'); review.className = 'op-review'; review.href = `${C.BASE}/review/?book=${encodeURIComponent(book.id)}`;
      review.textContent = state.present ? '내용 검토·출판 확정 →' : '';
      if (state.present) row.append(review);
      const bonus = document.createElement('div'); bonus.className='audio-bonus-operator';
      const status = document.createElement('small');
      status.textContent = book.audiobook?.tracks?.length
        ? '오디오북 장별 제작본 업로드 · 출판 및 음성 검수 승인 전에는 구매자에게 공개되지 않습니다.'
        : '무료 오디오북 제작 준비 · 출판 승인·권리·음성 검수 후 장별 트랙을 등록합니다.';
      bonus.append(status);
      for (const track of book.audiobook?.tracks || []) {
        const audioLabel = document.createElement('label');
        audioLabel.textContent = `오디오북 ${track.number}장 ${track.title} MP3 업로드`;
        const upload = document.createElement('input'); upload.type='file'; upload.accept='.mp3,audio/mpeg';
        upload.addEventListener('change', async()=>{
          const file=upload.files?.[0]; if(!file) return;
          if(file.size>32*1024*1024){alert('장별 파일은 32MB 이하로 나누어 주세요.');return;}
          audioLabel.firstChild.textContent='업로드 중…';
          try {
            const current=await C.session();
            const response=await fetch(`${C.BASE}/api/commerce/admin/audiobooks/${encodeURIComponent(book.id)}/${track.number}`,{
              method:'PUT',headers:{authorization:'Bearer '+(current?.accessToken||''),'content-type':'audio/mpeg'},body:file,
            });
            const data=await response.json().catch(()=>({}));
            if(!response.ok) throw new Error(data.error||'업로드 실패');
            alert(data.approvedForDelivery?'승인된 보너스 오디오북 파일이 등록됐습니다.':'검수 대기 오디오를 등록했습니다. 출판사 승인 전에는 공개되지 않습니다.');
            operatorPanel();load();
          }catch(e){alert(e.message);audioLabel.firstChild.textContent='다시 업로드';}
        });
        audioLabel.append(upload);bonus.append(audioLabel);
      }
      row.append(bonus);host.append(row);
    }
    if (run === operatorRun) $('operatorBooks').replaceChildren(host);
  }
  load().then(operatorPanel);
})();
