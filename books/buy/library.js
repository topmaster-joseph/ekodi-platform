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
  // 외부 로그인 공급자의 내부 alias(email)는 인증용으로만 사용하고 독자 화면에 노출하지 않는다.
  function friendlyAccount(data) {
    const name = String(data?.displayName || data?.name || '').trim();
    if (name && !name.includes('@') && name.length <= 30) return name;
    const email = String(data?.email || '').trim();
    const internal = /^identity\+([a-z][a-z0-9_-]*)\.[a-z0-9]+@ekodi\.kr$/i.exec(email);
    if (internal) {
      const names = { kakao: '카카오', naver: '네이버', google: '구글', apple: 'Apple', daum: '다음' };
      return (names[internal[1].toLowerCase()] || '연결') + ' 계정';
    }
    const local = email.includes('@') ? email.split('@')[0] : '';
    return local ? (local.length > 20 ? local.slice(0, 19) + '…' : local) + '님' : '회원님';
  }
  let libraryAccount = '';
  async function load() {
    try {
      const data = await C.api('library');
      $('libLogin').hidden = true;
      const items = Array.isArray(data.items) ? data.items : [];
      libraryAccount = friendlyAccount(data);
      const who = document.createElement('span'); who.className = 'lib-account'; who.textContent = libraryAccount;
      const out = document.createElement('button'); out.type = 'button'; out.className = 'lib-switch'; out.textContent = '로그아웃';
      out.addEventListener('click', async () => { out.disabled = true; await C.signOut(); location.reload(); });
      $('libStatus').replaceChildren(who, ` · 보유 도서 ${items.length}권 `, out);
      const list = $('libraryList'); list.replaceChildren();
      if (!items.length) {
        const empty = document.createElement('section'); empty.className = 'library-empty';
        const title = document.createElement('h2'); title.textContent = '첫 책을 만나 보세요';
        const note = document.createElement('p'); note.textContent = '아직 구매한 책이 없습니다. 마음에 드는 책을 찾아 서재에 담아 보세요.';
        const link = document.createElement('a'); link.href = `${C.BASE}/#catalog`; link.textContent = '도서 목록 살펴보기';
        empty.append(title, note, link); list.append(empty); return;
      }
      for (const item of items) {
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
        if (item.audiobook?.ready && item.audiobook.tracks?.length && window.EkodiAudioPlayer) {
          const listen = document.createElement('button'); listen.type = 'button'; listen.className = 'read-btn'; listen.textContent = '오디오북 듣기';
          listen.addEventListener('click', async () => {
            try { await window.EkodiAudioPlayer.open({ item, fetchTrack: async n => new Blob([await fetchBook(`download/audio/${encodeURIComponent(item.id)}/${n}`)], { type: 'audio/mpeg' }) }); }
            catch (e) { alert(e.message); }
          });
          actions.append(listen);
        }
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
    // LIBRARY-OPERATOR-COMPACT-001: 책마다 연번·한 줄(제목 · 파일 · 판매상태 · 검토·확정 · 새 판본)로 표시
    const head = document.createElement('div'); head.className = 'op-row op-head';
    for (const t of ['No.', '도서', '판매 파일', '판매 상태', '']) { const c = document.createElement('span'); c.textContent = t; head.append(c); }
    host.append(head);
    let no = 0;
    for (const book of books) {
      let state;
      try { state = await C.api(`admin/approvals/${encodeURIComponent(book.id)}`); }
      catch (e) {
        if (e.status === 403 || e.status === 401) {
          // 운영자 화면이 왜 안 보이는지 알 수 있게: 지금 로그인한 계정이 운영자 계정이 아니라는 안내만 보인다(권한은 서버가 판단).
          const note = $('operatorNote');
          if (note && libraryAccount) { note.hidden = false; note.textContent = `출판 도서 관리·낭독 음성 녹음은 운영자 구글 계정(topmaster.joseph@gmail.com 등)으로 로그인해야 보입니다. 지금 로그인: ${libraryAccount}`; }
          return;
        }
        continue;
      }
      $('operatorPanel').hidden = false;
      const file = state.file, ready = state.readiness || {};
      const row = document.createElement('div'); row.className = 'op-row';
      const num = document.createElement('span'); num.className = 'op-no'; num.textContent = String(++no).padStart(2, '0');
      const title = document.createElement('b'); title.className = 'op-title'; title.textContent = book.title; title.title = `${book.title} · ${book.id}`;
      const meta = document.createElement('span'); meta.className = 'op-meta';
      meta.textContent = file ? `${(file.size / 1024 / 1024).toFixed(2)}MB · ${new Date(file.uploaded).toLocaleDateString('ko-KR')}` : '파일 없음';
      const badge = document.createElement('span');
      badge.className = `op-badge ${ready.ready ? 'on' : 'off'}`;
      badge.textContent = ready.ready ? (ready.source === 'approval' ? '판매 중 · 확정' : '판매 중') : (ready.label || '준비 중');
      const actions = document.createElement('span'); actions.className = 'op-actions';
      const audioLink = document.createElement('a'); audioLink.className = 'op-btn ghost'; audioLink.href = `${C.BASE}/audio-review/?book=${encodeURIComponent(book.id)}`; audioLink.textContent = '오디오북'; actions.append(audioLink);
      if (file) { const review = document.createElement('a'); review.className = 'op-btn ghost'; review.href = `${C.BASE}/review/?book=${encodeURIComponent(book.id)}`; review.textContent = ready.ready ? '검토' : '검토·확정'; actions.append(review); }
      const label = document.createElement('label'); label.className = 'op-btn'; label.textContent = file ? '새 판본' : 'EPUB 올리기';
      const input = document.createElement('input'); input.type = 'file'; input.accept = '.epub,application/epub+zip';
      input.addEventListener('change', async () => {
        const f = input.files?.[0]; if (!f) return;
        if (ready.source === 'approval' && !confirm('새 파일을 올리면 출판 확정이 해제되어 다시 검토·확정할 때까지 판매가 멈춥니다. 계속할까요?')) { input.value = ''; return; }
        label.firstChild.textContent = '올리는 중…';
        try {
          const s = await C.session();
          const r = await fetch(`${C.BASE}/api/commerce/admin/files/${encodeURIComponent(book.id)}`, { method: 'PUT', headers: { authorization: 'Bearer ' + (s?.accessToken || ''), 'content-type': 'application/epub+zip' }, body: f });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error || '올리지 못했습니다.');
          alert(`${book.title} 판매 파일을 올렸습니다.`); operatorPanel(); load();
        } catch (e) { alert(e.message); label.firstChild.textContent = '다시 올리기'; }
      });
      label.append(input); actions.append(label);
      row.append(num, title, meta, badge, actions);
      host.append(row);
      // 오디오북: 트랙이 있는 도서만 접힌 영역으로 표시(기존 업로드 기능 유지)
      if (book.audiobook?.tracks?.length) {
        const bonus = document.createElement('details'); bonus.className = 'audio-bonus-operator';
        const sum = document.createElement('summary'); sum.textContent = `${book.title} · 오디오북 장별 업로드 (${book.audiobook.tracks.length}장)`; bonus.append(sum);
        for (const track of book.audiobook.tracks) {
          const audioLabel = document.createElement('label');
          audioLabel.textContent = `오디오북 ${track.number}장 ${track.title} MP3 업로드`;
          const upload = document.createElement('input'); upload.type='file'; upload.accept='.mp3,audio/mpeg';
          upload.addEventListener('change', async()=>{
            const af=upload.files?.[0]; if(!af) return;
            if(af.size>32*1024*1024){alert('장별 파일은 32MB 이하로 나누어 주세요.');return;}
            audioLabel.firstChild.textContent='업로드 중…';
            try {
              const current=await C.session();
              const response=await fetch(`${C.BASE}/api/commerce/admin/audiobooks/${encodeURIComponent(book.id)}/${track.number}`,{
                method:'PUT',headers:{authorization:'Bearer '+(current?.accessToken||''),'content-type':'audio/mpeg'},body:af,
              });
              const data=await response.json().catch(()=>({}));
              if(!response.ok) throw new Error(data.error||'업로드 실패');
              alert(data.approvedForDelivery?'승인된 보너스 오디오북 파일이 등록됐습니다.':'검수 대기 오디오를 등록했습니다. 출판사 승인 전에는 공개되지 않습니다.');
              operatorPanel();load();
            }catch(e){alert(e.message);audioLabel.firstChild.textContent='다시 업로드';}
          });
          audioLabel.append(upload);bonus.append(audioLabel);
        }
        host.append(bonus);
      }
    }
    if (run === operatorRun) $('operatorBooks').replaceChildren(host);
  }
  load().then(operatorPanel);
})();
