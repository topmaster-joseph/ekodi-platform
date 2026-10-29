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
  // Licensed audio files are requested only after the server confirms ebook ownership.
  let activeAudioUrl = null;
  async function openAudiobook(item, host, trigger) {
    trigger.disabled = true;
    const prior = trigger.textContent;
    trigger.textContent = '확인 중…';
    try {
      const info = await C.api('audiobook/' + encodeURIComponent(item.id));
      host.replaceChildren();
      if (info.status !== 'ready' || !info.tracks?.length) {
        const p = document.createElement('p'); p.textContent = '고급 음성 오디오북을 제작하고 있습니다. 준비되면 이곳에서 무료로 들을 수 있습니다.';
        host.append(p); return;
      }
      const player = document.createElement('audio'); player.controls = true; player.preload = 'none';
      player.setAttribute('aria-label', item.title + ' 오디오북 재생기');
      const list = document.createElement('div'); list.className = 'audio-track-list';
      for (const track of info.tracks) {
        const play = document.createElement('button'); play.type = 'button';
        play.textContent = track.number + '. ' + track.title;
        play.addEventListener('click', async () => {
          play.disabled = true; const saved = play.textContent; play.textContent = '불러오는 중…';
          try {
            const session = await C.session();
            const response = await fetch(`${C.BASE}/api/commerce/audiobook/${encodeURIComponent(item.id)}/track/${track.number}`, {
              headers: { authorization: 'Bearer ' + (session?.accessToken || '') }, cache: 'no-store',
            });
            if (!response.ok) {
              const err = await response.json().catch(() => ({}));
              throw new Error(err.error || '음원을 불러오지 못했습니다.');
            }
            const blob = await response.blob();
            if (activeAudioUrl) { player.pause(); URL.revokeObjectURL(activeAudioUrl); }
            activeAudioUrl = URL.createObjectURL(blob);
            player.src = activeAudioUrl;
            await player.play();
          } catch (e) { alert(e.message); }
          finally { play.disabled = false; play.textContent = saved; }
        });
        list.append(play);
      }
      host.append(player, list);
    } catch (error) { alert(error.message); }
    finally { trigger.disabled = false; trigger.textContent = prior; }
  }
  async function refreshExternal() {
    $('externalAudioPanel').hidden = false;
    const status = $('externalClaimStatus');
    try {
      const [claims, library] = await Promise.all([
        C.api('audiobook/claims'), C.api('audiobook/external-library'),
      ]);
      $('externalClaimForm').querySelector('button[type="submit"]').disabled = false;
      const host = $('externalClaimList'); host.replaceChildren();
      for (const claim of claims.claims || []) {
        const p = document.createElement('p');
        p.textContent = claim.retailer + ' · ' + claim.book_id + ' · ' +
          ({ pending:'구매확인 중', verified:'승인됨', rejected:'반려됨', revoked:'권한 철회' }[claim.status] || claim.status);
        host.append(p);
      }
      const books = $('externalAudioBooks'); books.replaceChildren();
      for (const item of library.items || []) {
        const row = document.createElement('article'); row.className = 'library-item';
        const info = document.createElement('div'); const title = document.createElement('h3');
        title.textContent = item.title; const p = document.createElement('p');
        p.textContent = '외부 서점 구매 확인 완료 · 무료 오디오북 전용 (전자책 다운로드 권한 없음)';
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = item.bonusStatus === 'preparing' ? '오디오북 제작 현황' : '오디오북 듣기';
        const details = document.createElement('div'); info.append(title,p,button,details);
        button.addEventListener('click',()=>openAudiobook(item,details,button));
        row.append(C.cover(item),info);books.append(row);
      }
      status.textContent = '외부 구매확인 요청은 판매처 결제 확인 후 처리됩니다.';
    } catch (e) {
      status.textContent = '외부 구매확인 기능은 아직 준비 중입니다. ' + (e.status === 503 ? '운영 저장소 적용이 필요합니다.' : e.message);
      $('externalClaimForm').querySelector('button[type="submit"]').disabled = true;
    }
  }
  async function refreshExternalAdmin() {
    try {
      const pending = await C.api('admin/audiobook/claims');
      $('externalAudioAdmin').hidden = false;
      const host = $('externalPendingClaims'); host.replaceChildren();
      for (const item of pending.claims || []) {
        const panel = document.createElement('article'); panel.className = 'library-item';
        const info = document.createElement('div'); const p = document.createElement('p');
        p.textContent = item.retailer + ' / ' + item.book_id + ' / ' + item.buyer_email + ' / 주문번호 끝 ' + item.order_suffix;
        if (item.status === 'verified') {
          const reason = document.createElement('select');
          reason.setAttribute('aria-label','오디오북 접근권 철회 사유');
          for (const [v,t] of [['refund','구매 환불'],['chargeback','결제 취소'],['fraud','부정구매'],['owner_request','구매자 요청']]) {
            const option=document.createElement('option');option.value=v;option.textContent=t;reason.append(option);
          }
          const revoke=document.createElement('button');revoke.type='button';revoke.textContent='오디오북 접근권 철회';
          revoke.addEventListener('click',async()=>{
            if(!window.confirm('구매자 오디오북 접근권을 철회하시겠습니까?'))return;
            revoke.disabled=true;
            try {
              await C.api(`admin/audiobook/claims/${encodeURIComponent(item.id)}/revoke`,{
                method:'POST',body:{confirm:true,reason:reason.value}
              });
              await refreshExternalAdmin();await refreshExternal();
            } catch(e) { alert(e.message); }
            finally { revoke.disabled=false; }
          });
          info.append(p,reason,revoke);panel.append(info);host.append(panel);continue;
        }
        const label = document.createElement('label'); label.textContent = '판매처에서 직접 확인한 전체 주문번호';
        const number = document.createElement('input'); number.autocomplete='off'; number.maxLength=128;
        const checked = document.createElement('label');
        const box = document.createElement('input'); box.type = 'checkbox';
        checked.append(box, document.createTextNode(' 판매처의 결제 완료·환불 여부를 확인했습니다.'));
        const ownerChecked = document.createElement('label');
        const ownerBox = document.createElement('input'); ownerBox.type='checkbox';
        ownerChecked.append(ownerBox,document.createTextNode(' 구매자 동일인 여부를 판매처 기록으로 확인했습니다.'));
        const approve = document.createElement('button'); approve.type='button'; approve.textContent='구매확인 승인';
        approve.addEventListener('click',async()=>{
          if(!box.checked||!ownerBox.checked||!number.value.trim()){
            alert('구매자 동일인 확인, 결제·환불 확인, 판매처 주문번호가 모두 필요합니다.');return;
          }
          approve.disabled=true;
          try{
            await C.api(`admin/audiobook/claims/${encodeURIComponent(item.id)}/approve`,{
              method:'POST',body:{orderNumber:number.value.trim(),confirmedWithRetailer:true,
                buyerIdentityMatched:true,refundStatusChecked:true,verificationMethod:'retailer_portal'}
            });
            number.value='';refreshExternalAdmin();refreshExternal();
          }catch(e){alert(e.message)}finally{approve.disabled=false}
        });
        const rejectReason = document.createElement('select');
        for (const [value,labelText] of [
          ['invalid_order','주문 확인 불가'],['cancelled','취소·환불'],
          ['duplicate','중복 신청'],['identity_mismatch','구매자 불일치'],['other','기타 사유']]) {
          const option=document.createElement('option');option.value=value;option.textContent=labelText;rejectReason.append(option);
        }
        rejectReason.setAttribute('aria-label','반려 사유');
        const reject=document.createElement('button');reject.type='button';reject.textContent='신청 반려';
        reject.addEventListener('click',async()=>{
          if(!window.confirm('구매확인 신청을 반려하시겠습니까?'))return;
          reject.disabled=true;
          try{
            await C.api(`admin/audiobook/claims/${encodeURIComponent(item.id)}/reject`,{
              method:'POST',body:{confirm:true,reason:rejectReason.value}
            });
            refreshExternalAdmin();refreshExternal();
          }catch(e){alert(e.message)}finally{reject.disabled=false}
        });
        info.append(p,label,number,checked,ownerChecked,approve,rejectReason,reject);
        panel.append(info);host.append(panel);
      }
    } catch (e) { if(e.status!==401&&e.status!==403) $('externalAudioAdmin').hidden = true; }
  }
  async function initExternalClaims() {
    const form = $('externalClaimForm');
    try {
      const catalog = await (await fetch(`${C.BASE}/books.json`,{cache:'no-store'})).json();
      const select = $('audioClaimBook'); select.replaceChildren();
      for (const b of catalog.books || []) if (b.bonusAudio?.included === true) {
        const opt = document.createElement('option');opt.value=b.id;opt.textContent=b.title;select.append(opt);
      }
      if (!select.options.length) form.querySelector('button[type="submit"]').disabled = true;
    } catch { form.querySelector('button[type="submit"]').disabled = true; }
    form.addEventListener('submit',async(e)=>{
      e.preventDefault();
      const btn=form.querySelector('button[type="submit"]');
      if (!btn || btn.disabled || !$('externalClaimConsent').checked) return;
      btn.disabled=true;
      try {
        await C.api('audiobook/claims',{method:'POST',body:{
          bookId:$('audioClaimBook').value,retailer:$('audioRetailer').value,
          orderNumber:$('externalOrderNumber').value.trim(),consent:true,
        }});
        $('externalOrderNumber').value='';$('externalClaimConsent').checked=false;
        await refreshExternal();
      } catch(err) { $('externalClaimStatus').textContent=err.message; }
      finally {btn.disabled=false}
    });
  }
  async function load() {
    try {
      const data = await C.api('library');
      $('libLogin').hidden = true;
      $('libStatus').textContent = `${data.email} · ${data.items.length}권`;
      const list = $('libraryList'); list.replaceChildren();
      if (!data.items.length) { const p = document.createElement('p'); p.innerHTML = '아직 구매한 책이 없습니다. '; const a = document.createElement('a'); a.href = `${C.BASE}/#catalog`; a.textContent = '출판 목록 보기 →'; p.append(a); list.append(p); await refreshExternal(); return; }
      for (const item of data.items) {
        const row = document.createElement('article'); row.className = 'library-item';
        const info = document.createElement('div'); const h = document.createElement('h3'); h.textContent = item.title; const p = document.createElement('p');
        p.textContent = `${item.author} · ${new Date(item.grantedAt).toLocaleDateString('ko-KR')} 구매`; info.append(h, p);
        const btn = document.createElement('button'); btn.type = 'button';
        btn.textContent = item.downloadReady ? 'EPUB 받기' : '파일 준비 중'; btn.disabled = !item.downloadReady;
        btn.addEventListener('click', () => download(item, btn));
        if (item.audiobookBonus?.included === true) {
          const area = document.createElement('div'); area.className = 'audiobook-bonus';
          const label = document.createElement('p'); label.textContent = '구매자 전용 무료 보너스 · 고품질 오디오북';
          const show = document.createElement('button'); show.type = 'button';
          show.textContent = item.audiobookBonus.status === 'preparing' ? '오디오북 준비 현황' : '오디오북 듣기';
          show.addEventListener('click', () => openAudiobook(item, area, show));
          info.append(label, show, area);
        }
        row.append(C.cover(item), info, btn); list.append(row);
      }
      await refreshExternal();
    } catch (e) {
      if (e.status === 401) { $('libStatus').textContent = '로그인이 필요합니다.'; $('libLogin').hidden = false; C.mountGoogle($('googleButton'), (t, err) => { $('accountStatus').textContent = t || ''; }, () => load().then(operatorPanel)); }
      else $('libStatus').textContent = e.message;
    }
  }
  async function operatorPanel() {
    let catalog;
    try { catalog = await (await fetch(`${C.BASE}/books.json`, { cache: 'no-store' })).json(); } catch { return; }
    const books = (catalog.books || []).filter(b => b.directSale?.enabled);
    const host = $('operatorBooks'); host.replaceChildren();
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
      label.append(input); row.append(info, label); host.append(row);
    }
  }
  initExternalClaims();
  load().then(() => {operatorPanel(); refreshExternalAdmin();});
})();
